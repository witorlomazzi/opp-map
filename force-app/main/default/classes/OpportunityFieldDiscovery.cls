/**
 * Discovers Opportunity multipicklist fields at runtime through Schema
 * describe. Nothing is hardcoded: any custom multipicklist (Tag__c,
 * Etiqueta__c, ...) added by an admin shows up as a filter automatically.
 */
public with sharing class OpportunityFieldDiscovery {
    public class FilterField {
        @AuraEnabled public String apiName;
        @AuraEnabled public String label;
        @AuraEnabled public List<PicklistOption> options;
    }

    public class PicklistOption {
        @AuraEnabled public String value;
        @AuraEnabled public String label;
    }

    /** All multipicklist fields visible to the running user, with their active values. */
    public static List<FilterField> getMultipicklistFields() {
        List<FilterField> result = new List<FilterField>();
        for (Schema.SObjectField f : Schema.SObjectType.Opportunity.fields.getMap().values()) {
            Schema.DescribeFieldResult d = f.getDescribe();
            if (d.getType() != Schema.DisplayType.MULTIPICKLIST || !d.isAccessible()) {
                continue;
            }
            FilterField field = new FilterField();
            field.apiName = d.getName();
            field.label = d.getLabel();
            field.options = new List<PicklistOption>();
            for (Schema.PicklistEntry entry : d.getPicklistValues()) {
                if (entry.isActive()) {
                    PicklistOption option = new PicklistOption();
                    option.value = entry.getValue();
                    option.label = entry.getLabel();
                    field.options.add(option);
                }
            }
            result.add(field);
        }
        return result;
    }

    /** Lowercase API names — whitelist used to keep dynamic SOQL injection-proof. */
    public static Set<String> getMultipicklistApiNames() {
        Set<String> names = new Set<String>();
        for (FilterField f : getMultipicklistFields()) {
            names.add(f.apiName.toLowerCase());
        }
        return names;
    }
}
