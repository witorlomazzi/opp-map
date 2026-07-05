import { LightningElement } from 'lwc';
import getOpportunities from '@salesforce/apex/OpportunityMapController.getOpportunities';
import requestGeocoding from '@salesforce/apex/OpportunityMapController.requestGeocoding';

const TABLE_LABEL_MAX_LENGTH = 15;
const TABLE_LABEL_CUT_AT = 12;

function truncateLabel(value) {
    if (!value || value.length <= TABLE_LABEL_MAX_LENGTH) {
        return value;
    }
    return value.slice(0, TABLE_LABEL_CUT_AT) + '...';
}

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

    activeTab = 'filters';

    _filters = {};
    _bbox = null;
    _cache = new Map();

    connectedCallback() {
        this.runQuery();
    }

    get isFiltersTab() {
        return this.activeTab === 'filters';
    }

    get isTableTab() {
        return this.activeTab === 'table';
    }

    get filtersTabClass() {
        return this.isFiltersTab ? 'op-tab-btn is-active' : 'op-tab-btn';
    }

    get tableTabClass() {
        return this.isTableTab ? 'op-tab-btn is-active' : 'op-tab-btn';
    }

    handleTabClick(event) {
        this.activeTab = event.currentTarget.dataset.tab;
    }

    handleRowClick(event) {
        this.focusOnMap(event.currentTarget.dataset.oppId);
    }

    handleRowKeydown(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.focusOnMap(event.currentTarget.dataset.oppId);
        }
    }

    focusOnMap(oppId) {
        const map = this.refs.map;
        if (map) {
            map.focusOpportunity(oppId);
        }
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

    get tableRows() {
        return this.markers.map((m) => ({
            oppId: m.oppId,
            accountName: truncateLabel(m.accountName),
            accountNameFull: m.accountName,
            name: truncateLabel(m.name),
            nameFull: m.name,
            amount: m.amount,
            stageName: m.stageName,
            mainProduct: m.mainProduct
        }));
    }

    get markerCount() {
        return this.markers.length;
    }

    get hasMarkers() {
        return this.markers.length > 0;
    }
}
