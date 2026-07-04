/**
 * Filter payload sent by the LWC filter panel (deserialized from JSON).
 */
public with sharing class OppMapFilters {
    @AuraEnabled public Date closeDateFrom;
    @AuraEnabled public Date closeDateTo;
    @AuraEnabled public Decimal minAmount;
    @AuraEnabled public Decimal maxAmount;
    @AuraEnabled public List<String> stages;
    @AuraEnabled public List<String> recordTypeIds;
    @AuraEnabled public List<String> productIds;
    /** 'won' | 'lost' | 'open' | null */
    @AuraEnabled public String wonLost;
    @AuraEnabled public List<MultiPicklistFilter> multipicklist;
    @AuraEnabled public Bbox bbox;
    @AuraEnabled public Integer minCycleAgeDays;
    @AuraEnabled public Integer maxCycleAgeDays;
    @AuraEnabled public Integer limitCount;

    public class MultiPicklistFilter {
        @AuraEnabled public String field;
        @AuraEnabled public List<String> values;
        /** 'any' (INCLUDES any of) | 'all' (INCLUDES every one) */
        @AuraEnabled public String mode;
    }

    public class Bbox {
        @AuraEnabled public Decimal south;
        @AuraEnabled public Decimal west;
        @AuraEnabled public Decimal north;
        @AuraEnabled public Decimal east;
    }
}
