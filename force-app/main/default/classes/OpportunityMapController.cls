/**
 * LWC-facing controller. Thin by design: filter metadata discovery and the
 * dynamic query live in their own classes.
 */
public with sharing class OpportunityMapController {
    public class FilterMetadata {
        @AuraEnabled public List<OpportunityFieldDiscovery.FilterField> multipicklistFields;
        @AuraEnabled public List<OpportunityFieldDiscovery.PicklistOption> stages;
        @AuraEnabled public List<OpportunityFieldDiscovery.PicklistOption> recordTypes;
        @AuraEnabled public List<OpportunityFieldDiscovery.PicklistOption> products;
    }

    @AuraEnabled(cacheable=true)
    public static FilterMetadata getFilterMetadata() {
        FilterMetadata meta = new FilterMetadata();
        meta.multipicklistFields = OpportunityFieldDiscovery.getMultipicklistFields();

        meta.stages = new List<OpportunityFieldDiscovery.PicklistOption>();
        for (Schema.PicklistEntry entry : Opportunity.StageName.getDescribe().getPicklistValues()) {
            if (entry.isActive()) {
                OpportunityFieldDiscovery.PicklistOption o = new OpportunityFieldDiscovery.PicklistOption();
                o.value = entry.getValue();
                o.label = entry.getLabel();
                meta.stages.add(o);
            }
        }

        meta.recordTypes = new List<OpportunityFieldDiscovery.PicklistOption>();
        for (Schema.RecordTypeInfo info : Schema.SObjectType.Opportunity.getRecordTypeInfos()) {
            if (info.isAvailable() && !info.isMaster()) {
                OpportunityFieldDiscovery.PicklistOption o = new OpportunityFieldDiscovery.PicklistOption();
                o.value = info.getRecordTypeId();
                o.label = info.getName();
                meta.recordTypes.add(o);
            }
        }

        meta.products = new List<OpportunityFieldDiscovery.PicklistOption>();
        for (AggregateResult ar : [
            SELECT Product2Id pid, Product2.Name pname
            FROM OpportunityLineItem
            WITH USER_MODE
            GROUP BY Product2Id, Product2.Name
            ORDER BY Product2.Name
            LIMIT 200
        ]) {
            OpportunityFieldDiscovery.PicklistOption o = new OpportunityFieldDiscovery.PicklistOption();
            o.value = String.valueOf(ar.get('pid'));
            o.label = String.valueOf(ar.get('pname'));
            meta.products.add(o);
        }
        return meta;
    }

    @AuraEnabled
    public static OpportunityMapSelector.MapResult getOpportunities(String filtersJson) {
        try {
            OppMapFilters filters = String.isBlank(filtersJson)
                ? new OppMapFilters()
                : (OppMapFilters) JSON.deserialize(filtersJson, OppMapFilters.class);
            return OpportunityMapSelector.search(filters);
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('Map query failed: ' + e.getMessage());
        }
    }

    /** Kicks off async geocoding for accounts missing coordinates. Returns queued count. */
    @AuraEnabled
    public static Integer requestGeocoding() {
        return AccountGeocodingQueue.enqueuePendingAccounts();
    }
}
