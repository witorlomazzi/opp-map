import { LightningElement } from 'lwc';
import getOpportunities from '@salesforce/apex/OpportunityMapController.getOpportunities';
import requestGeocoding from '@salesforce/apex/OpportunityMapController.requestGeocoding';

/**
 * Orchestrator: holds filter state, calls Apex, caches results per filter
 * combination for the session, exports CSV and surfaces truncation warnings.
 */
export default class OppMapContainer extends LightningElement {
    markers = [];
    truncated = false;
    loading = false;
    error;
    geocodeMessage;

    _filters = {};
    _bbox = null;
    _cache = new Map();

    connectedCallback() {
        this.runQuery();
    }

    handleFilterChange(event) {
        this._filters = event.detail || {};
        this.runQuery();
    }

    handleBoundsFilter(event) {
        this._bbox = event.detail;
        this.runQuery();
    }

    get effectiveFilters() {
        return { ...this._filters, bbox: this._bbox };
    }

    async runQuery() {
        const payload = JSON.stringify(this.effectiveFilters);
        if (this._cache.has(payload)) {
            const cached = this._cache.get(payload);
            this.markers = cached.markers;
            this.truncated = cached.truncated;
            return;
        }
        this.loading = true;
        this.error = undefined;
        try {
            const result = await getOpportunities({ filtersJson: payload });
            this.markers = result.markers;
            this.truncated = result.truncated;
            this._cache.set(payload, result);
        } catch (e) {
            this.error = e.body ? e.body.message : String(e);
            this.markers = [];
            this.truncated = false;
        } finally {
            this.loading = false;
        }
    }

    async handleRequestGeocoding() {
        try {
            const queued = await requestGeocoding();
            this.geocodeMessage = queued > 0
                ? `${queued} conta(s) enviadas para geocodificação assíncrona.`
                : 'Nenhuma conta pendente de geocodificação.';
        } catch (e) {
            this.geocodeMessage = 'Falha ao solicitar geocodificação: '
                + (e.body ? e.body.message : String(e));
        }
    }

    handleExportCsv() {
        const header = ['Conta', 'Oportunidade', 'Valor', 'Estágio', 'Fechamento', 'Produto', 'Latitude', 'Longitude'];
        const escapeCell = (v) => {
            const s = v == null ? '' : String(v);
            return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const rows = this.markers.map((m) => [
            m.accountName, m.name, m.amount, m.stageName, m.closeDate,
            m.mainProduct, m.latitude, m.longitude
        ].map(escapeCell).join(';'));
        const csv = '﻿' + [header.join(';'), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'oportunidades-mapa.csv';
        link.click();
        URL.revokeObjectURL(link.href);
    }

    get markerCount() {
        return this.markers.length;
    }

    get hasMarkers() {
        return this.markers.length > 0;
    }
}
