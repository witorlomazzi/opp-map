import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET from '@salesforce/resourceUrl/leaflet';
import OPP_MAP_THEME from '@salesforce/resourceUrl/oppMapTheme';

/**
 * Presentational map: receives markers and renders Leaflet with clustering
 * and a heatmap toggle. One pin is rendered per ACCOUNT (not per opportunity)
 * since several opportunities commonly share the same account/coordinates;
 * clicking a pin emits 'accountopportunities' with every opportunity at that
 * location so the container can list them in the sidebar instead of a
 * cramped Leaflet popup. Also emits 'boundsfilter' when the user asks to
 * filter by the current viewport. The accessible table view lives in the
 * container, not here, so it can share the sidebar's tabbed layout.
 */
export default class OppMap extends LightningElement {
    _markers = [];
    leafletReady = false;
    heatmapMode = false;
    ageColorMode = false;

    _map;
    _clusterLayer;
    _heatLayer;
    _resizeObserver;
    _defaultIcon;
    _iconsByBucket = {};
    _markersByOppId = new Map();

    @api
    get markers() {
        return this._markers;
    }
    set markers(value) {
        this._markers = value || [];
        this.renderMarkers();
    }

    renderedCallback() {
        if (this._initStarted) {
            return;
        }
        this._initStarted = true;
        Promise.all([
            loadStyle(this, LEAFLET + '/leaflet.css'),
            loadStyle(this, LEAFLET + '/MarkerCluster.css'),
            loadStyle(this, LEAFLET + '/MarkerCluster.Default.css'),
            loadStyle(this, OPP_MAP_THEME),
            loadScript(this, LEAFLET + '/leaflet.js')
        ])
            .then(() =>
                Promise.all([
                    loadScript(this, LEAFLET + '/leaflet.markercluster.js'),
                    loadScript(this, LEAFLET + '/leaflet-heat.js')
                ])
            )
            .then(() => {
                this.buildDefaultIcon();
                this.initMap();
                this.leafletReady = true;
                this.renderMarkers();
            })
            .catch((error) => {
                // eslint-disable-next-line no-console
                console.error('Leaflet failed to load', error);
            });
    }

    buildDefaultIcon() {
        // Leaflet's raster default icon (marker-icon.png) depends on an image
        // URL resolved relative to leaflet.js's own <script> tag, which kept
        // breaking under Lightning's sandboxing no matter how it was patched.
        // A divIcon sidesteps the whole class of problem: it's just inline
        // SVG/HTML, no image request to fail.
        // eslint-disable-next-line no-undef
        this._defaultIcon = L.divIcon({
            className: 'op-marker-pin',
            html:
                '<svg viewBox="0 0 24 24" width="28" height="28">' +
                '<path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z" fill="#5b5fef"/>' +
                '<circle cx="12" cy="10" r="3.2" fill="#ffffff"/>' +
                '</svg>',
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -26]
        });

        // Age-coloring palette mirrors the Deal Risk Engine's Fresh/Stale/Cold
        // language, so the same visual vocabulary means the same thing across
        // this portfolio's projects.
        const bucketColors = { Fresh: '#0f9d58', Stale: '#dd7a01', Cold: '#ba0517' };
        this._iconsByBucket = {};
        Object.keys(bucketColors).forEach((bucket) => {
            // eslint-disable-next-line no-undef
            this._iconsByBucket[bucket] = L.divIcon({
                className: 'op-marker-pin',
                html:
                    '<svg viewBox="0 0 24 24" width="28" height="28">' +
                    '<path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z" fill="' +
                    bucketColors[bucket] +
                    '"/>' +
                    '<circle cx="12" cy="10" r="3.2" fill="#ffffff"/>' +
                    '</svg>',
                iconSize: [28, 28],
                iconAnchor: [14, 28],
                popupAnchor: [0, -26]
            });
        });
    }

    /** Worst bucket among a group's opportunities (Cold > Stale > Fresh) decides the pin color. */
    worstBucketFor(opportunities) {
        const severity = { Cold: 3, Stale: 2, Fresh: 1 };
        let worst = 'Fresh';
        opportunities.forEach((opp) => {
            if (opp.activityBucket && severity[opp.activityBucket] > severity[worst]) {
                worst = opp.activityBucket;
            }
        });
        return worst;
    }

    initMap() {
        const container = this.template.querySelector('.map-root');
        // eslint-disable-next-line no-undef
        this._map = L.map(container, { center: [10, 0], zoom: 2 });
        // eslint-disable-next-line no-undef
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(this._map);

        // The map card now flexes to fill the viewport height, so Leaflet's
        // size can be wrong until layout settles (or when the window/tab
        // resizes) unless it's told to re-measure.
        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(() => {
                if (this._map) {
                    this._map.invalidateSize();
                }
            });
            this._resizeObserver.observe(container);
        }
    }

    disconnectedCallback() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
        }
    }

    renderMarkers() {
        if (!this.leafletReady || !this._map) {
            return;
        }
        if (this._clusterLayer) {
            this._map.removeLayer(this._clusterLayer);
            this._clusterLayer = null;
        }
        if (this._heatLayer) {
            this._map.removeLayer(this._heatLayer);
            this._heatLayer = null;
        }
        if (this.heatmapMode) {
            const points = this._markers
                .filter((m) => m.isWon)
                .map((m) => [m.latitude, m.longitude, 1]);
            // eslint-disable-next-line no-undef
            this._heatLayer = L.heatLayer(points, { radius: 30, blur: 20 });
            this._heatLayer.addTo(this._map);
            return;
        }
        // One marker per ACCOUNT: opportunities sharing an account share its
        // billing coordinates, so grouping avoids stacking identical pins.
        const groups = new Map(); // accountId -> { accountName, latitude, longitude, opportunities }
        this._markers.forEach((m) => {
            const key = m.accountId || `${m.latitude},${m.longitude}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    accountName: m.accountName,
                    latitude: m.latitude,
                    longitude: m.longitude,
                    opportunities: []
                });
            }
            groups.get(key).opportunities.push(m);
        });

        // chunkedLoading spreads the initial clustering work across animation
        // frames instead of doing it all synchronously, so adding thousands
        // of markers doesn't freeze the tab.
        // eslint-disable-next-line no-undef
        this._clusterLayer = L.markerClusterGroup({ chunkedLoading: true, chunkDelay: 30 });
        this._markersByOppId = new Map();
        const leafletMarkers = [];
        groups.forEach((group) => {
            const icon = this.ageColorMode
                ? this._iconsByBucket[this.worstBucketFor(group.opportunities)] || this._defaultIcon
                : this._defaultIcon;
            // eslint-disable-next-line no-undef
            const marker = L.marker([group.latitude, group.longitude], { icon });
            marker.on('click', () => this.emitAccountSelected(group));
            group.opportunities.forEach((opp) => this._markersByOppId.set(opp.oppId, marker));
            leafletMarkers.push(marker);
        });
        // addLayers() bulk-inserts in one pass; looping addLayer() per marker
        // is dramatically slower once there are thousands of them.
        this._clusterLayer.addLayers(leafletMarkers);
        this._map.addLayer(this._clusterLayer);
    }

    emitAccountSelected(group) {
        this.dispatchEvent(
            new CustomEvent('accountopportunities', {
                detail: { accountName: group.accountName, opportunities: group.opportunities }
            })
        );
    }

    /** Centers the map on a marker (zooming out of its cluster if needed) and lists its account's opportunities. */
    @api
    focusOpportunity(oppId) {
        const marker = this._markersByOppId.get(oppId);
        if (!marker || !this._map) {
            return;
        }
        const openGroup = () => {
            const match = this._markers.find((m) => m.oppId === oppId);
            if (match) {
                const key = match.accountId || `${match.latitude},${match.longitude}`;
                const opportunities = this._markers.filter(
                    (m) => (m.accountId || `${m.latitude},${m.longitude}`) === key
                );
                this.emitAccountSelected({ accountName: match.accountName, opportunities });
            }
        };
        if (this.heatmapMode) {
            this._map.setView(marker.getLatLng(), Math.max(this._map.getZoom(), 14));
            openGroup();
            return;
        }
        if (this._clusterLayer && typeof this._clusterLayer.zoomToShowLayer === 'function') {
            this._clusterLayer.zoomToShowLayer(marker, openGroup);
        } else {
            this._map.setView(marker.getLatLng(), Math.max(this._map.getZoom(), 14));
            openGroup();
        }
    }

    get toggleLabel() {
        return this.heatmapMode ? 'Ver pontos' : 'Ver heatmap (ganhas)';
    }

    get hasMarkers() {
        return this._markers.length > 0;
    }

    get showEmptyState() {
        return this.leafletReady && !this.hasMarkers && !this.heatmapMode;
    }

    get heatmapButtonClass() {
        return this.heatmapMode ? 'op-icon-btn is-active' : 'op-icon-btn';
    }

    handleToggleHeatmap() {
        this.heatmapMode = !this.heatmapMode;
        this.renderMarkers();
    }

    get ageColorButtonClass() {
        return this.ageColorMode ? 'op-icon-btn is-active' : 'op-icon-btn';
    }

    get ageColorLabel() {
        return this.ageColorMode ? 'Ver cor padrão' : 'Colorir por idade';
    }

    handleToggleAgeColor() {
        this.ageColorMode = !this.ageColorMode;
        this.renderMarkers();
    }

    handleFilterByView() {
        if (!this._map) {
            return;
        }
        const b = this._map.getBounds();
        this.dispatchEvent(
            new CustomEvent('boundsfilter', {
                detail: {
                    south: b.getSouth(),
                    west: b.getWest(),
                    north: b.getNorth(),
                    east: b.getEast()
                }
            })
        );
    }

    handleClearBounds() {
        this.dispatchEvent(new CustomEvent('boundsfilter', { detail: null }));
    }
}
