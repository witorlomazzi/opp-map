import { createElement } from 'lwc';
import OppMapFilterPanel from 'c/oppMapFilterPanel';
import getFilterMetadata from '@salesforce/apex/OpportunityMapController.getFilterMetadata';

jest.mock(
    '@salesforce/apex/OpportunityMapController.getFilterMetadata',
    () => {
        const { createApexTestWireAdapter } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);

const METADATA = {
    stages: [{ label: 'Prospecting', value: 'Prospecting' }],
    recordTypes: [],
    products: [{ label: 'Widget', value: '01t000000000001' }],
    multipicklistFields: [
        {
            apiName: 'Tag__c',
            label: 'Tag',
            options: [
                { label: 'Estratégica', value: 'Estrategica' },
                { label: 'Urgente', value: 'Urgente' }
            ]
        },
        {
            apiName: 'Etiqueta__c',
            label: 'Etiqueta',
            options: [{ label: 'VIP', value: 'VIP' }]
        }
    ]
};

describe('c-opp-map-filter-panel', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.useRealTimers();
    });

    function build() {
        const element = createElement('c-opp-map-filter-panel', { is: OppMapFilterPanel });
        document.body.appendChild(element);
        return element;
    }

    it('renders one dual-listbox per discovered multipicklist (no hardcoding)', async () => {
        const element = build();
        getFilterMetadata.emit(METADATA);
        await Promise.resolve();

        const dynamicBoxes = [
            ...element.shadowRoot.querySelectorAll('lightning-dual-listbox[data-field]')
        ];
        expect(dynamicBoxes).toHaveLength(2);
        expect(dynamicBoxes.map((b) => b.dataset.field)).toEqual(['Tag__c', 'Etiqueta__c']);
        expect(dynamicBoxes[0].options).toHaveLength(2);
    });

    it('fires a single debounced filterchange with multipicklist selection', async () => {
        jest.useFakeTimers();
        const element = build();
        getFilterMetadata.emit(METADATA);
        await Promise.resolve();

        const handler = jest.fn();
        element.addEventListener('filterchange', handler);

        const tagBox = element.shadowRoot.querySelector(
            'lightning-dual-listbox[data-field="Tag__c"]'
        );
        tagBox.dispatchEvent(
            new CustomEvent('change', { detail: { value: ['Estrategica'] } })
        );
        tagBox.dispatchEvent(
            new CustomEvent('change', { detail: { value: ['Estrategica', 'Urgente'] } })
        );

        expect(handler).not.toHaveBeenCalled(); // debounce pending
        jest.runAllTimers();

        expect(handler).toHaveBeenCalledTimes(1);
        const detail = handler.mock.calls[0][0].detail;
        expect(detail.multipicklist).toEqual([
            { field: 'Tag__c', values: ['Estrategica', 'Urgente'], mode: 'any' }
        ]);
    });

    it('shows an error message when the wire fails', async () => {
        const element = build();
        getFilterMetadata.error({ message: 'boom' });
        await Promise.resolve();

        expect(element.shadowRoot.querySelector('[role="alert"]')).not.toBeNull();
    });
});
