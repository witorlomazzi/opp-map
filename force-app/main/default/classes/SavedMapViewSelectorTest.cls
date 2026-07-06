@IsTest
private class SavedMapViewSelectorTest {
    @TestSetup
    static void setup() {
        PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name = 'Opp_Map_User' LIMIT 1];
        List<PermissionSetAssignment> existing = [SELECT Id FROM PermissionSetAssignment WHERE AssigneeId = :UserInfo.getUserId() AND PermissionSetId = :ps.Id];
        if (existing.isEmpty()) {
            insert new PermissionSetAssignment(AssigneeId = UserInfo.getUserId(), PermissionSetId = ps.Id);
        }
    }

    @IsTest
    static void testGetMyViewsReturnsOnlyOwnViewsWithRealRecords() {
        insert new Saved_Map_View__c(Name = 'Minha Visão', Filters_JSON__c = '{"stages":["Prospecting"]}');

        Test.startTest();
        List<Saved_Map_View__c> views = SavedMapViewSelector.getMyViews();
        Test.stopTest();

        System.assertEquals(1, views.size());
        System.assertEquals('Minha Visão', views[0].Name);
    }

    @IsTest
    static void testGetMyViewsUsesOverrideWhenSet() {
        SavedMapViewSelector.viewOverrides = new List<Saved_Map_View__c>{
            new Saved_Map_View__c(Name = 'Fake View', Filters_JSON__c = '{}')
        };

        Test.startTest();
        List<Saved_Map_View__c> views = SavedMapViewSelector.getMyViews();
        Test.stopTest();

        System.assertEquals(1, views.size());
        System.assertEquals('Fake View', views[0].Name);
    }
}
