import { createElement } from 'lwc';
import OppMapContainer from 'c/oppMapContainer';
import getOpportunities from '@salesforce/apex/OpportunityMapController.getOpportunities';

jest.mock(
    '@salesforce/apex/OpportunityMapController.getOpportunities',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/OpportunityMapController.requestGeocoding',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const RESULT = {
    markers: [
        {
            oppId: '006000000000001',
            name: 'Deal',
            accountName: 'Acme',
            latitude: -23.5,
            longitude: -46.6,
            amount: 1000,
            stageName: 'Prospecting',
            multipicklistValues: {}
        }
    ],
    truncated: true,
    returnedCount: 1
};

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('c-opp-map-container', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('queries on load, passes markers to the map and shows truncation warning', async () => {
        getOpportunities.mockResolvedValue(RESULT);
        const element = createElement('c-opp-map-container', { is: OppMapContainer });
        document.body.appendChild(element);
        await flush();

        const map = element.shadowRoot.querySelector('c-opp-map');
        expect(map.markers).toHaveLength(1);
        expect(element.shadowRoot.textContent).toContain('refine seus filtros');
    });

    it('re-queries when the filter panel emits filterchange and caches repeats', async () => {
        getOpportunities.mockResolvedValue(RESULT);
        const element = createElement('c-opp-map-container', { is: OppMapContainer });
        document.body.appendChild(element);
        await flush();

        const panel = element.shadowRoot.querySelector('c-opp-map-filter-panel');
        const filters = { minAmount: 100, multipicklist: [] };
        panel.dispatchEvent(new CustomEvent('filterchange', { detail: filters }));
        await flush();
        panel.dispatchEvent(new CustomEvent('filterchange', { detail: filters }));
        await flush();

        // initial load + first filterchange; identical repeat served from cache
        expect(getOpportunities).toHaveBeenCalledTimes(2);
    });

    it('shows the Apex error message when the query fails', async () => {
        getOpportunities.mockRejectedValue({ body: { message: 'sem acesso' } });
        const element = createElement('c-opp-map-container', { is: OppMapContainer });
        document.body.appendChild(element);
        await flush();

        expect(element.shadowRoot.textContent).toContain('sem acesso');
    });
});
