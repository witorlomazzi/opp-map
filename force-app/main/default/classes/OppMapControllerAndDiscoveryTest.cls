@IsTest
private class OppMapControllerAndDiscoveryTest {
    @IsTest
    static void discoveryFindsCustomMultipicklist() {
        List<OpportunityFieldDiscovery.FilterField> fields =
            OpportunityFieldDiscovery.getMultipicklistFields();
        Boolean foundTag = false;
        for (OpportunityFieldDiscovery.FilterField f : fields) {
            if (f.apiName == 'Tag__c') {
                foundTag = true;
                Assert.isFalse(f.options.isEmpty(), 'Tag__c must expose its picklist values');
            }
        }
        Assert.isTrue(foundTag, 'Tag__c must be discovered without any hardcoding');
        Assert.isTrue(OpportunityFieldDiscovery.getMultipicklistApiNames().contains('tag__c'));
    }

    @IsTest
    static void filterMetadataIncludesStagesAndProducts() {
        Id prodId = OppMapTestDataFactory.setupProductWithEntry('Meta Product');
        Account acc = OppMapTestDataFactory.geoAccount('Meta Acc', 10, 10);
        insert acc;
        Opportunity opp = OppMapTestDataFactory.opp(acc.Id, 'Meta Opp', 1000, 'Prospecting', Date.today().addDays(10));
        insert opp;
        OppMapTestDataFactory.addLineItem(opp.Id, prodId);

        Test.startTest();
        OpportunityMapController.FilterMetadata meta = OpportunityMapController.getFilterMetadata();
        Test.stopTest();

        Assert.isFalse(meta.stages.isEmpty(), 'Stage options must come from describe');
        Assert.isFalse(meta.multipicklistFields.isEmpty());
        Boolean hasProduct = false;
        for (OpportunityFieldDiscovery.PicklistOption o : meta.products) {
            if (o.label == 'Meta Product') {
                hasProduct = true;
            }
        }
        Assert.isTrue(hasProduct, 'Products in use must be offered as filter options');
    }

    @IsTest
    static void controllerParsesJsonAndDelegates() {
        Account acc = OppMapTestDataFactory.geoAccount('Json Acc', -23, -46);
        insert acc;
        insert OppMapTestDataFactory.opp(acc.Id, 'Json Opp', 5000, 'Prospecting', Date.today().addDays(15));

        Test.startTest();
        OpportunityMapSelector.MapResult all = OpportunityMapController.getOpportunities(null);
        OpportunityMapSelector.MapResult filtered = OpportunityMapController.getOpportunities(
            '{"minAmount": 999999}');
        Test.stopTest();

        Assert.areEqual(1, all.returnedCount);
        Assert.areEqual(0, filtered.returnedCount);
    }

    @IsTest
    static void controllerWrapsBadJsonInAuraException() {
        try {
            OpportunityMapController.getOpportunities('{not valid json');
            Assert.fail('Expected AuraHandledException');
        } catch (AuraHandledException expected) {
            Assert.isTrue(true);
        }
    }
}
