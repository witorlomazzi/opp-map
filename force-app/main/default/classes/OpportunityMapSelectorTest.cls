@IsTest
private class OpportunityMapSelectorTest {
    @TestSetup
    static void setup() {
        Account sp = OppMapTestDataFactory.geoAccount('Sao Paulo Corp', -23.55, -46.63);
        Account ny = OppMapTestDataFactory.geoAccount('New York Inc', 40.71, -74.00);
        Account noGeo = new Account(Name = 'No Coordinates Ltd', BillingCity = 'Lisbon');
        insert new List<Account>{ sp, ny, noGeo };

        Opportunity big = OppMapTestDataFactory.opp(sp.Id, 'Big SP Deal', 500000, 'Prospecting', Date.today().addDays(60));
        big.Tag__c = 'Estrategica;Urgente';
        Opportunity small = OppMapTestDataFactory.opp(ny.Id, 'Small NY Deal', 10000, 'Closed Won', Date.today().addDays(-10));
        small.Tag__c = 'Renovacao';
        Opportunity hidden = OppMapTestDataFactory.opp(noGeo.Id, 'No Geo Deal', 99000, 'Prospecting', Date.today().addDays(30));
        insert new List<Opportunity>{ big, small, hidden };
    }

    private static OppMapFilters filters() {
        return new OppMapFilters();
    }

    @IsTest
    static void noFiltersReturnsOnlyGeolocatedOpps() {
        OpportunityMapSelector.MapResult result = OpportunityMapSelector.search(filters());
        Assert.areEqual(2, result.returnedCount, 'Opps without coordinates cannot appear on the map');
        Assert.isFalse(result.truncated);
        Assert.areEqual('Big SP Deal', result.markers[0].name, 'Ordered by Amount desc');
        Assert.isNotNull(result.markers[0].latitude);
        Assert.areEqual('Sao Paulo Corp', result.markers[0].accountName);
    }

    @IsTest
    static void amountAndStageFilters() {
        OppMapFilters f = filters();
        f.minAmount = 100000;
        Assert.areEqual(1, OpportunityMapSelector.search(f).returnedCount);

        f = filters();
        f.stages = new List<String>{ 'Closed Won' };
        OpportunityMapSelector.MapResult result = OpportunityMapSelector.search(f);
        Assert.areEqual(1, result.returnedCount);
        Assert.areEqual('Small NY Deal', result.markers[0].name);
    }

    @IsTest
    static void wonLostAndCloseDateFilters() {
        OppMapFilters f = filters();
        f.wonLost = 'won';
        Assert.areEqual(1, OpportunityMapSelector.search(f).returnedCount);

        f = filters();
        f.wonLost = 'open';
        f.closeDateFrom = Date.today();
        OpportunityMapSelector.MapResult result = OpportunityMapSelector.search(f);
        Assert.areEqual(1, result.returnedCount);
        Assert.areEqual('Big SP Deal', result.markers[0].name);
    }

    @IsTest
    static void boundingBoxFilterSelectsRegion() {
        OppMapFilters f = filters();
        f.bbox = new OppMapFilters.Bbox();
        // Box around South America only.
        f.bbox.south = -35;
        f.bbox.north = 5;
        f.bbox.west = -75;
        f.bbox.east = -30;
        OpportunityMapSelector.MapResult result = OpportunityMapSelector.search(f);
        Assert.areEqual(1, result.returnedCount);
        Assert.areEqual('Big SP Deal', result.markers[0].name);
    }

    @IsTest
    static void multipicklistAnyAndAllModes() {
        OppMapFilters f = filters();
        OppMapFilters.MultiPicklistFilter mp = new OppMapFilters.MultiPicklistFilter();
        mp.field = 'Tag__c';
        mp.values = new List<String>{ 'Estrategica', 'Renovacao' };
        mp.mode = 'any';
        f.multipicklist = new List<OppMapFilters.MultiPicklistFilter>{ mp };
        Assert.areEqual(2, OpportunityMapSelector.search(f).returnedCount, 'ANY matches both opps');

        mp.mode = 'all';
        Assert.areEqual(0, OpportunityMapSelector.search(f).returnedCount, 'No opp has both tags');

        mp.values = new List<String>{ 'Estrategica', 'Urgente' };
        OpportunityMapSelector.MapResult result = OpportunityMapSelector.search(f);
        Assert.areEqual(1, result.returnedCount, 'Big SP Deal has both tags');
        Assert.isTrue(result.markers[0].multipicklistValues.get('Tag__c').contains('Estrategica'));
    }

    @IsTest
    static void unknownMultipicklistFieldIsRejected() {
        OppMapFilters f = filters();
        OppMapFilters.MultiPicklistFilter mp = new OppMapFilters.MultiPicklistFilter();
        mp.field = 'Name FROM Opportunity--'; // injection attempt
        mp.values = new List<String>{ 'x' };
        f.multipicklist = new List<OppMapFilters.MultiPicklistFilter>{ mp };
        try {
            OpportunityMapSelector.search(f);
            Assert.fail('Expected AuraHandledException');
        } catch (AuraHandledException expected) {
            Assert.isTrue(true, 'Field names outside the describe whitelist are rejected');
        }
    }

    @IsTest
    static void productFilter() {
        Id prodId = OppMapTestDataFactory.setupProductWithEntry('Widget Pro');
        Opportunity big = [SELECT Id FROM Opportunity WHERE Name = 'Big SP Deal'];
        OppMapTestDataFactory.addLineItem(big.Id, prodId);

        OppMapFilters f = filters();
        f.productIds = new List<String>{ prodId };
        OpportunityMapSelector.MapResult result = OpportunityMapSelector.search(f);
        Assert.areEqual(1, result.returnedCount);
        Assert.areEqual('Widget Pro', result.markers[0].mainProduct);
    }

    @IsTest
    static void cycleAgeFilterAppliesPostQuery() {
        OppMapFilters f = filters();
        f.minCycleAgeDays = 36500; // ~100 years: nothing qualifies
        Assert.areEqual(0, OpportunityMapSelector.search(f).returnedCount);

        f = filters();
        f.maxCycleAgeDays = 36500;
        Assert.areEqual(2, OpportunityMapSelector.search(f).returnedCount);
    }

    @IsTest
    static void resultLimitAndTruncationFlag() {
        OppMapFilters f = filters();
        f.limitCount = 1;
        OpportunityMapSelector.MapResult result = OpportunityMapSelector.search(f);
        Assert.areEqual(1, result.returnedCount);
        Assert.isTrue(result.truncated, 'More rows exist than the requested limit');
    }

    @IsTest
    static void markersIncludeOwnerCreatedDateAndActivityBucket() {
        OpportunityMapSelector.MapResult result = OpportunityMapSelector.search(filters());
        for (OpportunityMapSelector.Marker marker : result.markers) {
            Assert.isNotNull(marker.ownerName, 'Owner name should be populated');
            Assert.isNotNull(marker.createdDate, 'CreatedDate should be populated');
            Assert.isNotNull(marker.activityBucket, 'Activity bucket should always be computed');
            Assert.isTrue(
                new Set<String>{ 'Fresh', 'Stale', 'Cold' }.contains(marker.activityBucket),
                'Unexpected activity bucket: ' + marker.activityBucket
            );
        }
    }
}
