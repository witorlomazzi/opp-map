import { LightningElement } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getOpportunities from '@salesforce/apex/OpportunityMapController.getOpportunities';
import requestGeocoding from '@salesforce/apex/OpportunityMapController.requestGeocoding';
import getTeamMembers from '@salesforce/apex/OpportunityMapController.getTeamMembers';
import getSavedViews from '@salesforce/apex/OpportunityMapController.getSavedViews';
import saveView from '@salesforce/apex/OpportunityMapController.saveView';
import deleteView from '@salesforce/apex/OpportunityMapController.deleteView';

const TABLE_LABEL_MAX_LENGTH = 15;
const TABLE_LABEL_CUT_AT = 12;

function truncateLabel(value) {
    if (!value || value.length <= TABLE_LABEL_MAX_LENGTH) {
        return value;
    }
    return value.slice(0, TABLE_LABEL_CUT_AT) + '...';
}

function badgeClassFor(m) {
    if (m.isWon) {
        return 'op-badge op-badge-won';
    }
    if (m.isClosed) {
        return 'op-badge op-badge-lost';
    }
    return 'op-badge op-badge-open';
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
    tableSearchTerm = '';
    selectedAccount;

    _filters = {};
    _bbox = null;
    _cache = new Map();

    savedViews = [];
    newViewName = '';

    connectedCallback() {
        this.runQuery();
        this.loadSavedViews();
    }

    get isFiltersTab() {
        return this.activeTab === 'filters';
    }

    get isTableTab() {
        return this.activeTab === 'table';
    }

    get isAccountTab() {
        return this.activeTab === 'account';
    }

    get hasSelectedAccount() {
        return !!this.selectedAccount;
    }

    get filtersTabClass() {
        return this.isFiltersTab ? 'op-tab-btn is-active' : 'op-tab-btn';
    }

    get tableTabClass() {
        return this.isTableTab ? 'op-tab-btn is-active' : 'op-tab-btn';
    }

    get accountTabClass() {
        return this.isAccountTab ? 'op-tab-btn is-active' : 'op-tab-btn';
    }

    handleTabClick(event) {
        this.activeTab = event.currentTarget.dataset.tab;
    }

    handleAccountSelected(event) {
        const { accountName, opportunities } = event.detail;
        this.selectedAccount = {
            accountName,
            opportunities: opportunities.map((opp) => ({
                oppId: opp.oppId,
                name: opp.name,
                amount: opp.amount,
                stageName: opp.stageName,
                badgeClass: badgeClassFor(opp),
                ownerName: opp.ownerName,
                createdDate: opp.createdDate,
                activityBucketClass: 'op-age-badge op-age-' + (opp.activityBucket || 'fresh').toLowerCase(),
                activityBucketLabel: opp.activityBucket,
                recordUrl: '/lightning/r/Opportunity/' + opp.oppId + '/view',
                teamExpanded: false,
                teamMembers: null,
                teamLoading: false,
                hasNoTeamMembers: false
            }))
        };
        this.activeTab = 'account';
    }

    async handleToggleTeam(event) {
        event.stopPropagation();
        const oppId = event.currentTarget.dataset.oppId;
        const opportunities = this.selectedAccount.opportunities.map((opp) => ({ ...opp }));
        const target = opportunities.find((opp) => opp.oppId === oppId);
        if (!target) {
            return;
        }
        target.teamExpanded = !target.teamExpanded;
        this.selectedAccount = { ...this.selectedAccount, opportunities };

        if (target.teamExpanded && target.teamMembers === null) {
            target.teamLoading = true;
            this.selectedAccount = { ...this.selectedAccount, opportunities: [...opportunities] };
            try {
                const members = await getTeamMembers({ opportunityId: oppId });
                target.teamMembers = members;
                target.hasNoTeamMembers = members.length === 0;
            } catch (e) {
                target.teamMembers = [];
                target.hasNoTeamMembers = true;
            } finally {
                target.teamLoading = false;
                this.selectedAccount = {
                    ...this.selectedAccount,
                    opportunities: this.selectedAccount.opportunities.map((opp) =>
                        opp.oppId === oppId ? { ...target } : opp
                    )
                };
            }
        }
    }

    handleTableSearch(event) {
        this.tableSearchTerm = event.target.value;
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
        const term = this.tableSearchTerm.trim().toLowerCase();
        const filtered = term
            ? this.markers.filter((m) => [m.accountName, m.name, m.stageName, m.mainProduct]
                .some((v) => v && v.toLowerCase().includes(term)))
            : this.markers;
        return filtered.map((m) => ({
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

    get hasNoTableMatches() {
        return this.tableSearchTerm.trim().length > 0 && this.tableRows.length === 0;
    }

    get markerCount() {
        return this.markers.length;
    }

    get hasMarkers() {
        return this.markers.length > 0;
    }

    async loadSavedViews() {
        try {
            this.savedViews = await getSavedViews();
        } catch (e) {
            this.savedViews = [];
        }
    }

    get hasSavedViews() {
        return this.savedViews.length > 0;
    }

    get isSaveDisabled() {
        return !this.newViewName || !this.newViewName.trim();
    }

    handleNewViewNameChange(event) {
        this.newViewName = event.target.value;
    }

    async handleSaveView() {
        try {
            await saveView({ viewName: this.newViewName.trim(), filtersJson: JSON.stringify(this.effectiveFilters) });
            this.newViewName = '';
            await this.loadSavedViews();
            this.dispatchEvent(
                new ShowToastEvent({ title: 'Visão salva', variant: 'success' })
            );
        } catch (e) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Erro ao salvar visão',
                    message: e.body ? e.body.message : String(e),
                    variant: 'error'
                })
            );
        }
    }

    handleApplyView(event) {
        const viewId = event.currentTarget.dataset.id;
        const view = this.savedViews.find((v) => v.Id === viewId);
        if (!view) {
            return;
        }
        try {
            this._filters = JSON.parse(view.Filters_JSON__c) || {};
            this._bbox = this._filters.bbox || null;
            this.runQuery();
        } catch (e) {
            // malformed saved payload, ignore silently
        }
    }

    async handleDeleteView(event) {
        event.stopPropagation();
        const viewId = event.currentTarget.dataset.id;
        try {
            await deleteView({ viewId });
            await this.loadSavedViews();
        } catch (e) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Erro ao excluir visão',
                    message: e.body ? e.body.message : String(e),
                    variant: 'error'
                })
            );
        }
    }
}
