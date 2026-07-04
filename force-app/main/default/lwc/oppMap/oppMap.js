import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import LEAFLET from '@salesforce/resourceUrl/leaflet';

const MAX_POPUP_TAGS = 6;

/**
 * Presentational map: receives markers, renders Leaflet with clustering, a
 * heatmap toggle and a screen-reader-friendly table alternative. Emits
 * 'boundsfilter' when the user asks to filter by the current viewport.
 */
export default class OppMap extends LightningElement {
    _markers = [];
    leafletReady = false;
    heatmapMode = false;
    showTable = false;

    _map;
    _clusterLayer;
    _heatLayer;

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
            loadScript(this, LEAFLET + '/leaflet.js')
        ])
            .then(() =>
                Promise.all([
                    loadScript(this, LEAFLET + '/leaflet.markercluster.js'),
                    loadScript(this, LEAFLET + '/leaflet-heat.js')
                ])
            )
            .then(() => {
                this.initMap();
                this.leafletReady = true;
                this.renderMarkers();
            })
            .catch((error) => {
                // eslint-disable-next-line no-console
                console.error('Leaflet failed to load', error);
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
        // eslint-disable-next-line no-undef
        this._clusterLayer = L.markerClusterGroup();
        this._markers.forEach((m) => {
            // eslint-disable-next-line no-undef
            const marker = L.marker([m.latitude, m.longitude]);
            marker.bindPopup(this.buildPopup(m));
            this._clusterLayer.addLayer(marker);
        });
        this._map.addLayer(this._clusterLayer);
    }

    buildPopup(m) {
        const amount = m.amount != null
            ? Number(m.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            : '—';
        const tags = Object.values(m.multipicklistValues || {})
            .join(';')
            .split(';')
            .filter(Boolean)
            .slice(0, MAX_POPUP_TAGS)
            .join(', ');
        const esc = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return (
            `<strong>${esc(m.accountName)}</strong><br/>` +
            `${esc(m.name)}<br/>` +
            `Valor: ${esc(amount)}<br/>` +
            `Estágio: ${esc(m.stageName)}<br/>` +
            (m.mainProduct ? `Produto: ${esc(m.mainProduct)}<br/>` : '') +
            (tags ? `Tags: ${esc(tags)}` : '')
        );
    }

    get toggleLabel() {
        return this.heatmapMode ? 'Ver pontos' : 'Ver heatmap (ganhas)';
    }

    get tableToggleLabel() {
        return this.showTable ? 'Ocultar tabela' : 'Mostrar tabela (acessível)';
    }

    get hasMarkers() {
        return this._markers.length > 0;
    }

    handleToggleHeatmap() {
        this.heatmapMode = !this.heatmapMode;
        this.renderMarkers();
    }

    handleToggleTable() {
        this.showTable = !this.showTable;
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
