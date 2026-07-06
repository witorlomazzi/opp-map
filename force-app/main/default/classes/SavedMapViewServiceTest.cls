@IsTest
private class SavedMapViewServiceTest {
    @TestSetup
    static void setup() {
        PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name = 'Opp_Map_User' LIMIT 1];
        List<PermissionSetAssignment> existing = [SELECT Id FROM PermissionSetAssignment WHERE AssigneeId = :UserInfo.getUserId() AND PermissionSetId = :ps.Id];
        if (existing.isEmpty()) {
            insert new PermissionSetAssignment(AssigneeId = UserInfo.getUserId(), PermissionSetId = ps.Id);
        }
    }

    @IsTest
    static void testSaveViewCreatesRecord() {
        Test.startTest();
        Id viewId = SavedMapViewService.saveView('Pipeline Q4', '{"minAmount":1000}');
        Test.stopTest();

        Saved_Map_View__c view = [SELECT Name, Filters_JSON__c FROM Saved_Map_View__c WHERE Id = :viewId];
        System.assertEquals('Pipeline Q4', view.Name);
        System.assertEquals('{"minAmount":1000}', view.Filters_JSON__c);
    }

    @IsTest
    static void testDeleteViewRemovesRecord() {
        Saved_Map_View__c view = new Saved_Map_View__c(Name = 'To Delete', Filters_JSON__c = '{}');
        insert view;

        Test.startTest();
        SavedMapViewService.deleteView(view.Id);
        Test.stopTest();

        List<Saved_Map_View__c> remaining = [SELECT Id FROM Saved_Map_View__c WHERE Id = :view.Id];
        System.assertEquals(0, remaining.size());
    }
}
