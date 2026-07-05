import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET from '@salesforce/resourceUrl/leaflet';
import OPP_MAP_THEME from '@salesforce/resourceUrl/oppMapTheme';

const MAX_POPUP_TAGS = 6;

/**
 * Presentational map: receives markers and renders Leaflet with clustering
 * and a heatmap toggle. Emits 'boundsfilter' when the user asks to filter by
 * the current viewport. The accessible table view lives in the container,
 * not here, so it can share the sidebar's tabbed layout.
 */
export default class OppMap extends LightningElement {
    _markers = [];
    leafletReady = false;
    heatmapMode = false;

    _map;
    _clusterLayer;
    _heatLayer;
    _resizeObserver;
    _defaultIcon;
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
        // L.Marker's shared default icon is instantiated the moment leaflet.js
        // is parsed (Marker.prototype.options.icon = new IconDefault()),
        // using whatever icon URLs Leaflet auto-detected from its own <script>
        // tag at that instant. Lightning's sandboxing breaks that detection,
        // and patching L.Icon.Default afterwards doesn't reach that
        // already-built instance (it copied the options, not a live
        // reference). Building our own icon and passing it explicitly to
        // every marker sidesteps the whole problem.
        // eslint-disable-next-line no-undef
        this._defaultIcon = L.icon({
            iconUrl: LEAFLET + '/images/marker-icon.png',
            iconRetinaUrl: LEAFLET + '/images/marker-icon-2x.png',
            shadowUrl: LEAFLET + '/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            tooltipAnchor: [16, -28],
            shadowSize: [41, 41]
        });
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
        // chunkedLoading spreads the initial clustering work across animation
        // frames instead of doing it all synchronously, so adding thousands
        // of markers doesn't freeze the tab.
        // eslint-disable-next-line no-undef
        this._clusterLayer = L.markerClusterGroup({ chunkedLoading: true, chunkDelay: 30 });
        this._markersByOppId = new Map();
        const leafletMarkers = this._markers.map((m) => {
            // eslint-disable-next-line no-undef
            const marker = L.marker([m.latitude, m.longitude], { icon: this._defaultIcon });
            marker.bindPopup(() => this.buildPopup(m));
            this._markersByOppId.set(m.oppId, marker);
            return marker;
        });
        // addLayers() bulk-inserts in one pass; looping addLayer() per marker
        // is dramatically slower once there are thousands of them.
        this._clusterLayer.addLayers(leafletMarkers);
        this._map.addLayer(this._clusterLayer);
    }

    /** Centers the map on a marker (zooming out of its cluster if needed) and opens its popup. */
    @api
    focusOpportunity(oppId) {
        const marker = this._markersByOppId.get(oppId);
        if (!marker || !this._map) {
            return;
        }
        if (this.heatmapMode) {
            this._map.setView(marker.getLatLng(), Math.max(this._map.getZoom(), 14));
            return;
        }
        if (this._clusterLayer && typeof this._clusterLayer.zoomToShowLayer === 'function') {
            this._clusterLayer.zoomToShowLayer(marker, () => marker.openPopup());
        } else {
            this._map.setView(marker.getLatLng(), Math.max(this._map.getZoom(), 14));
            marker.openPopup();
        }
    }

    buildPopup(m) {
        const amount = m.amount != null
            ? Number(m.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            : '—';
        const tags = Object.values(m.multipicklistValues || {})
            .join(';')
            .split(';')
            .filter(Boolean)
            .slice(0, MAX_POPUP_TAGS);
        const esc = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const badgeClass = m.isWon ? 'op-badge-won' : m.isClosed ? 'op-badge-lost' : 'op-badge-open';
        const tagsHtml = tags.length
            ? `<div class="op-popup-tags">${tags.map((t) => `<span class="op-tag-chip">${esc(t)}</span>`).join('')}</div>`
            : '';
        const productRow = m.mainProduct
            ? `<div class="op-popup-row"><span>Produto</span><span>${esc(m.mainProduct)}</span></div>`
            : '';
        return (
            `<div class="op-popup-account">${esc(m.accountName)}</div>` +
            `<div class="op-popup-opp">${esc(m.name)}</div>` +
            `<div class="op-popup-row"><span>Valor</span><span class="op-popup-amount">${esc(amount)}</span></div>` +
            `<div class="op-popup-row"><span>Estágio</span><span class="op-badge ${badgeClass}">${esc(m.stageName)}</span></div>` +
            productRow +
            tagsHtml
        );
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
