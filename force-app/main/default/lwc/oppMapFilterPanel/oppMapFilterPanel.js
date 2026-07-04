import { LightningElement, wire } from 'lwc';
import getFilterMetadata from '@salesforce/apex/OpportunityMapController.getFilterMetadata';

const DEBOUNCE_MS = 400;

/**
 * Dynamic filter panel. Multipicklist filters are NOT hardcoded: whatever
 * getFilterMetadata discovers via Schema describe is rendered as a
 * dual-listbox with an any/all mode toggle.
 */
export default class OppMapFilterPanel extends LightningElement {
    stages = [];
    recordTypes = [];
    products = [];
    multipicklistFilters = []; // [{apiName, label, options, selected, mode}]
    error;

    closeDateFrom = null;
    closeDateTo = null;
    minAmount = null;
    maxAmount = null;
    selectedStages = [];
    selectedRecordTypes = [];
    selectedProducts = [];
    wonLost = '';
    minCycleAgeDays = null;
    maxCycleAgeDays = null;

    _debounceTimer;

    wonLostOptions = [
        { label: 'Todas', value: '' },
        { label: 'Ganhas', value: 'won' },
        { label: 'Perdidas', value: 'lost' },
        { label: 'Abertas', value: 'open' }
    ];

    modeOptions = [
        { label: 'Contém qualquer', value: 'any' },
        { label: 'Contém todos', value: 'all' }
    ];

    @wire(getFilterMetadata)
    wiredMetadata({ error, data }) {
        if (data) {
            this.stages = data.stages.map((o) => ({ label: o.label, value: o.value }));
            this.recordTypes = data.recordTypes.map((o) => ({ label: o.label, value: o.value }));
            this.products = data.products.map((o) => ({ label: o.label, value: o.value }));
            this.multipicklistFilters = data.multipicklistFields.map((f) => ({
                apiName: f.apiName,
                label: f.label,
                options: f.options.map((o) => ({ label: o.label, value: o.value })),
                selected: [],
                mode: 'any'
            }));
            this.error = undefined;
        } else if (error) {
            this.error = error.body ? error.body.message : String(error);
        }
    }

    get hasRecordTypes() {
        return this.recordTypes.length > 0;
    }

    get hasProducts() {
        return this.products.length > 0;
    }

    handleInput(event) {
        const { name } = event.target;
        const value = event.detail.value;
        switch (name) {
            case 'closeDateFrom': this.closeDateFrom = value || null; break;
            case 'closeDateTo': this.closeDateTo = value || null; break;
            case 'minAmount': this.minAmount = value ? Number(value) : null; break;
            case 'maxAmount': this.maxAmount = value ? Number(value) : null; break;
            case 'stages': this.selectedStages = value; break;
            case 'recordTypes': this.selectedRecordTypes = value; break;
            case 'products': this.selectedProducts = value; break;
            case 'wonLost': this.wonLost = value; break;
            case 'minCycleAgeDays': this.minCycleAgeDays = value ? Number(value) : null; break;
            case 'maxCycleAgeDays': this.maxCycleAgeDays = value ? Number(value) : null; break;
            default: break;
        }
        this.emitDebounced();
    }

    handleMultipicklistChange(event) {
        const apiName = event.target.dataset.field;
        const entry = this.multipicklistFilters.find((f) => f.apiName === apiName);
        if (entry) {
            entry.selected = event.detail.value;
        }
        this.emitDebounced();
    }

    handleModeChange(event) {
        const apiName = event.target.dataset.field;
        const entry = this.multipicklistFilters.find((f) => f.apiName === apiName);
        if (entry) {
            entry.mode = event.detail.value;
        }
        this.emitDebounced();
    }

    handleClear() {
        this.closeDateFrom = null;
        this.closeDateTo = null;
        this.minAmount = null;
        this.maxAmount = null;
        this.selectedStages = [];
        this.selectedRecordTypes = [];
        this.selectedProducts = [];
        this.wonLost = '';
        this.minCycleAgeDays = null;
        this.maxCycleAgeDays = null;
        this.multipicklistFilters = this.multipicklistFilters.map((f) => ({
            ...f, selected: [], mode: 'any'
        }));
        this.emitDebounced();
    }

    emitDebounced() {
        window.clearTimeout(this._debounceTimer);
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._debounceTimer = window.setTimeout(() => this.emitFilters(), DEBOUNCE_MS);
    }

    emitFilters() {
        const filters = {
            closeDateFrom: this.closeDateFrom,
            closeDateTo: this.closeDateTo,
            minAmount: this.minAmount,
            maxAmount: this.maxAmount,
            stages: this.selectedStages,
            recordTypeIds: this.selectedRecordTypes,
            productIds: this.selectedProducts,
            wonLost: this.wonLost || null,
            minCycleAgeDays: this.minCycleAgeDays,
            maxCycleAgeDays: this.maxCycleAgeDays,
            multipicklist: this.multipicklistFilters
                .filter((f) => f.selected.length > 0)
                .map((f) => ({ field: f.apiName, values: f.selected, mode: f.mode }))
        };
        this.dispatchEvent(new CustomEvent('filterchange', { detail: filters }));
    }
}
