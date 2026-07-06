public with sharing class SavedMapViewService {
    public static Id saveView(String viewName, String filtersJson) {
        Saved_Map_View__c view = new Saved_Map_View__c(
            Name = viewName,
            Filters_JSON__c = filtersJson
        );
        insert as user view;
        return view.Id;
    }

    public static void deleteView(Id viewId) {
        delete as user new Saved_Map_View__c(Id = viewId);
    }
}
