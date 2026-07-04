/**
 * Async geocoding fallback for accounts without BillingLatitude/Longitude.
 * Calls OpenStreetMap Nominatim through the Nominatim Named Credential and
 * caches the attempt timestamp (90 days) so accounts are never re-geocoded
 * on every run — including addresses that fail to resolve.
 * Processes up to 20 callouts per execution and chains itself for the rest.
 */
public with sharing class AccountGeocodingQueue implements Queueable, Database.AllowsCallouts {
    @TestVisible
    private static final Integer CALLOUTS_PER_RUN = 20;
    private static final Integer CACHE_DAYS = 90;

    private final List<Id> accountIds;

    public AccountGeocodingQueue(List<Id> accountIds) {
        this.accountIds = accountIds;
    }

    /** Finds accounts needing geocoding and enqueues the job. Returns how many were queued. */
    public static Integer enqueuePendingAccounts() {
        Datetime cacheCutoff = System.now().addDays(-CACHE_DAYS);
        List<Account> pending = [
            SELECT Id
            FROM Account
            WHERE BillingLatitude = null
                AND BillingCity != null
                AND (Geocode_Cache_Timestamp__c = null OR Geocode_Cache_Timestamp__c < :cacheCutoff)
            WITH USER_MODE
            LIMIT 200
        ];
        if (pending.isEmpty()) {
            return 0;
        }
        List<Id> ids = new List<Id>(new Map<Id, Account>(pending).keySet());
        System.enqueueJob(new AccountGeocodingQueue(ids));
        return ids.size();
    }

    public void execute(QueueableContext context) {
        List<Id> batch = new List<Id>();
        List<Id> remainder = new List<Id>();
        for (Id accId : accountIds) {
            if (batch.size() < CALLOUTS_PER_RUN) {
                batch.add(accId);
            } else {
                remainder.add(accId);
            }
        }

        List<Account> accounts = [
            SELECT Id, BillingStreet, BillingCity, BillingState, BillingCountry
            FROM Account
            WHERE Id IN :batch AND BillingLatitude = null
        ];
        List<Account> updates = new List<Account>();
        for (Account acc : accounts) {
            Account updated = geocode(acc);
            if (updated != null) {
                updates.add(updated);
            }
        }
        if (!updates.isEmpty()) {
            Database.update(updates, false);
        }
        if (!remainder.isEmpty() && !Test.isRunningTest()) {
            System.enqueueJob(new AccountGeocodingQueue(remainder));
        }
    }

    private Account geocode(Account acc) {
        List<String> parts = new List<String>();
        for (String part : new List<String>{
            acc.BillingStreet, acc.BillingCity, acc.BillingState, acc.BillingCountry
        }) {
            if (String.isNotBlank(part)) {
                parts.add(part);
            }
        }
        if (parts.isEmpty()) {
            return null;
        }
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:Nominatim/search?format=json&limit=1&q='
            + EncodingUtil.urlEncode(String.join(parts, ', '), 'UTF-8'));
        req.setMethod('GET');
        req.setHeader('User-Agent', 'salesforce-opp-map-portfolio');
        req.setTimeout(10000);

        Account updated = new Account(Id = acc.Id, Geocode_Cache_Timestamp__c = System.now());
        try {
            HttpResponse res = new Http().send(req);
            if (res.getStatusCode() == 200) {
                List<Object> results = (List<Object>) JSON.deserializeUntyped(res.getBody());
                if (!results.isEmpty()) {
                    Map<String, Object> first = (Map<String, Object>) results[0];
                    updated.BillingLatitude = Decimal.valueOf((String) first.get('lat'));
                    updated.BillingLongitude = Decimal.valueOf((String) first.get('lon'));
                }
            }
        } catch (Exception e) {
            // Timestamp still saved: failed addresses respect the cache window too.
            System.debug(LoggingLevel.WARN, 'Geocoding failed for ' + acc.Id + ': ' + e.getMessage());
        }
        return updated;
    }
}
