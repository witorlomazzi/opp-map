/**
 * Builds and runs the dynamic, injection-proof SOQL behind the map.
 *
 * Safety model:
 *  - every user-supplied VALUE goes through bind variables (Database.queryWithBinds)
 *  - every user-supplied FIELD NAME is validated against the Schema-describe
 *    whitelist of real Opportunity multipicklist fields
 *  - multipicklist literals (INCLUDES does not accept binds) are additionally
 *    escaped with String.escapeSingleQuotes
 *  - the final query runs WITH USER_MODE, so CRUD/FLS is enforced end to end
 */
public with sharing class OpportunityMapSelector {
    // 10,000 rows costs ~1 SOQL query and stays well inside the 50,000
    // query-row governor limit for synchronous Apex; the LWC clusters
    // markers with chunked loading so the browser doesn't block either.
    public static final Integer DEFAULT_LIMIT = 10000;

    public class MapResult {
        @AuraEnabled public List<Marker> markers;
        @AuraEnabled public Boolean truncated;
        @AuraEnabled public Integer returnedCount;
    }

    public class Marker {
        @AuraEnabled public Id oppId;
        @AuraEnabled public String name;
        @AuraEnabled public Id accountId;
        @AuraEnabled public String accountName;
        @AuraEnabled public Decimal latitude;
        @AuraEnabled public Decimal longitude;
        @AuraEnabled public Decimal amount;
        @AuraEnabled public String stageName;
        @AuraEnabled public Boolean isWon;
        @AuraEnabled public Boolean isClosed;
        @AuraEnabled public Date closeDate;
        @AuraEnabled public Integer cycleAgeDays;
        @AuraEnabled public String mainProduct;
        @AuraEnabled public Map<String, String> multipicklistValues;
    }

    public static MapResult search(OppMapFilters filters) {
        if (filters == null) {
            filters = new OppMapFilters();
        }
        // Proper-case API names for SELECT/marker keys; lowercase set for validation.
        List<String> multiFieldNames = new List<String>();
        Set<String> allowedMultiFields = new Set<String>();
        for (OpportunityFieldDiscovery.FilterField ff : OpportunityFieldDiscovery.getMultipicklistFields()) {
            multiFieldNames.add(ff.apiName);
            allowedMultiFields.add(ff.apiName.toLowerCase());
        }
        List<String> conditions = new List<String>{
            'Account.BillingLatitude != null',
            'Account.BillingLongitude != null'
        };
        Map<String, Object> binds = new Map<String, Object>();

        if (filters.closeDateFrom != null) {
            conditions.add('CloseDate >= :closeDateFrom');
            binds.put('closeDateFrom', filters.closeDateFrom);
        }
        if (filters.closeDateTo != null) {
            conditions.add('CloseDate <= :closeDateTo');
            binds.put('closeDateTo', filters.closeDateTo);
        }
        if (filters.minAmount != null) {
            conditions.add('Amount >= :minAmount');
            binds.put('minAmount', filters.minAmount);
        }
        if (filters.maxAmount != null) {
            conditions.add('Amount <= :maxAmount');
            binds.put('maxAmount', filters.maxAmount);
        }
        if (filters.stages != null && !filters.stages.isEmpty()) {
            conditions.add('StageName IN :stages');
            binds.put('stages', filters.stages);
        }
        if (filters.recordTypeIds != null && !filters.recordTypeIds.isEmpty()) {
            conditions.add('RecordTypeId IN :recordTypeIds');
            binds.put('recordTypeIds', filters.recordTypeIds);
        }
        if (filters.productIds != null && !filters.productIds.isEmpty()) {
            conditions.add('Id IN (SELECT OpportunityId FROM OpportunityLineItem WHERE Product2Id IN :productIds)');
            binds.put('productIds', filters.productIds);
        }
        if (filters.wonLost == 'won') {
            conditions.add('IsWon = true');
        } else if (filters.wonLost == 'lost') {
            conditions.add('IsClosed = true AND IsWon = false');
        } else if (filters.wonLost == 'open') {
            conditions.add('IsClosed = false');
        }
        if (filters.bbox != null) {
            conditions.add('Account.BillingLatitude >= :south AND Account.BillingLatitude <= :north');
            conditions.add('Account.BillingLongitude >= :west AND Account.BillingLongitude <= :east');
            binds.put('south', filters.bbox.south);
            binds.put('north', filters.bbox.north);
            binds.put('west', filters.bbox.west);
            binds.put('east', filters.bbox.east);
        }

        // Multipicklist: INCLUDES does not support bind variables, so values are
        // escaped literals and the field name must exist in the describe whitelist.
        List<String> selectedMultiFields = new List<String>();
        if (filters.multipicklist != null) {
            for (OppMapFilters.MultiPicklistFilter mp : filters.multipicklist) {
                if (mp.field == null || mp.values == null || mp.values.isEmpty()) {
                    continue;
                }
                if (!allowedMultiFields.contains(mp.field.toLowerCase())) {
                    throw new AuraHandledException('Unknown multipicklist field: ' + mp.field);
                }
                selectedMultiFields.add(mp.field);
                List<String> escaped = new List<String>();
                for (String v : mp.values) {
                    escaped.add('\'' + String.escapeSingleQuotes(v) + '\'');
                }
                if (mp.mode == 'all') {
                    List<String> parts = new List<String>();
                    for (String one : escaped) {
                        parts.add(mp.field + ' INCLUDES (' + one + ')');
                    }
                    conditions.add('(' + String.join(parts, ' AND ') + ')');
                } else {
                    conditions.add(mp.field + ' INCLUDES (' + String.join(escaped, ',') + ')');
                }
            }
        }

        // Always select every discovered multipicklist so popups can show tags.
        List<String> extraSelect = multiFieldNames;

        Integer maxRows = filters.limitCount != null && filters.limitCount > 0
            ? Math.min(filters.limitCount, DEFAULT_LIMIT)
            : DEFAULT_LIMIT;
        binds.put('limitPlusOne', maxRows + 1);

        String soql = 'SELECT Id, Name, AccountId, Amount, StageName, CloseDate, CreatedDate, IsWon, IsClosed, '
            + 'Account.Name, Account.BillingLatitude, Account.BillingLongitude'
            + (extraSelect.isEmpty() ? '' : ', ' + String.join(extraSelect, ', '))
            + ', (SELECT Product2.Name FROM OpportunityLineItems ORDER BY TotalPrice DESC LIMIT 1)'
            + ' FROM Opportunity WHERE ' + String.join(conditions, ' AND ')
            + ' ORDER BY Amount DESC NULLS LAST LIMIT :limitPlusOne';

        List<Opportunity> rows = Database.queryWithBinds(soql, binds, AccessLevel.USER_MODE);

        Boolean truncated = rows.size() > maxRows;
        if (truncated) {
            rows = trimTo(rows, maxRows);
        }

        MapResult result = new MapResult();
        result.markers = new List<Marker>();
        Date today = Date.today();
        for (Opportunity opp : rows) {
            // Cycle age (CloseDate - CreatedDate) cannot be filtered in SOQL; applied here.
            Integer cycleAge = opp.CreatedDate.date().daysBetween(opp.CloseDate);
            if (filters.minCycleAgeDays != null && cycleAge < filters.minCycleAgeDays) {
                continue;
            }
            if (filters.maxCycleAgeDays != null && cycleAge > filters.maxCycleAgeDays) {
                continue;
            }
            Marker m = new Marker();
            m.oppId = opp.Id;
            m.name = opp.Name;
            m.accountId = opp.AccountId;
            m.accountName = opp.Account.Name;
            m.latitude = opp.Account.BillingLatitude;
            m.longitude = opp.Account.BillingLongitude;
            m.amount = opp.Amount;
            m.stageName = opp.StageName;
            m.isWon = opp.IsWon;
            m.isClosed = opp.IsClosed;
            m.closeDate = opp.CloseDate;
            m.cycleAgeDays = cycleAge;
            m.mainProduct = opp.OpportunityLineItems.isEmpty()
                ? null
                : opp.OpportunityLineItems[0].Product2.Name;
            m.multipicklistValues = new Map<String, String>();
            for (String fieldName : multiFieldNames) {
                Object value = opp.get(fieldName);
                if (value != null) {
                    m.multipicklistValues.put(fieldName, String.valueOf(value));
                }
            }
            result.markers.add(m);
        }
        result.truncated = truncated;
        result.returnedCount = result.markers.size();
        return result;
    }

    private static List<Opportunity> trimTo(List<Opportunity> rows, Integer size) {
        List<Opportunity> trimmed = new List<Opportunity>();
        for (Integer i = 0; i < size; i++) {
            trimmed.add(rows[i]);
        }
        return trimmed;
    }
}
