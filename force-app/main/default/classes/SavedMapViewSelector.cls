public with sharing class SavedMapViewSelector {
    @TestVisible
    private static List<Saved_Map_View__c> viewOverrides;

    public static List<Saved_Map_View__c> getMyViews() {
        if (viewOverrides != null) {
            return viewOverrides;
        }
        return [
            SELECT Id, Name, Filters_JSON__c
            FROM Saved_Map_View__c
            WHERE OwnerId = :UserInfo.getUserId()
            WITH USER_MODE
            ORDER BY Name
        ];
    }
}
