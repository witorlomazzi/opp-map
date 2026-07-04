@IsTest
private class AccountGeocodingQueueTest {
    private class NominatimSuccessMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody('[{"lat":"-23.5505","lon":"-46.6333","display_name":"Sao Paulo"}]');
            return res;
        }
    }

    private class NominatimEmptyMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody('[]');
            return res;
        }
    }

    private class NominatimErrorMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(503);
            res.setBody('Service Unavailable');
            return res;
        }
    }

    @IsTest
    static void geocodesAccountAndSetsCache() {
        Account acc = new Account(
            Name = 'Geo Pending', BillingStreet = 'Av Paulista 1000',
            BillingCity = 'Sao Paulo', BillingCountry = 'Brazil');
        insert acc;

        Test.setMock(HttpCalloutMock.class, new NominatimSuccessMock());
        Test.startTest();
        Integer queued = AccountGeocodingQueue.enqueuePendingAccounts();
        Test.stopTest();

        Assert.areEqual(1, queued);
        Account result = [
            SELECT BillingLatitude, BillingLongitude, Geocode_Cache_Timestamp__c
            FROM Account WHERE Id = :acc.Id
        ];
        Assert.areEqual(-23.5505, result.BillingLatitude);
        Assert.areEqual(-46.6333, result.BillingLongitude);
        Assert.isNotNull(result.Geocode_Cache_Timestamp__c);
    }

    @IsTest
    static void emptyResultStillStampsCacheToAvoidRetries() {
        Account acc = new Account(Name = 'Unresolvable', BillingCity = 'Nowhere');
        insert acc;

        Test.setMock(HttpCalloutMock.class, new NominatimEmptyMock());
        Test.startTest();
        AccountGeocodingQueue.enqueuePendingAccounts();
        Test.stopTest();

        Account result = [
            SELECT BillingLatitude, Geocode_Cache_Timestamp__c FROM Account WHERE Id = :acc.Id
        ];
        Assert.isNull(result.BillingLatitude);
        Assert.isNotNull(result.Geocode_Cache_Timestamp__c,
            'Failed lookups must also be cached');
    }

    @IsTest
    static void httpErrorDoesNotThrowAndStampsCache() {
        Account acc = new Account(Name = 'Error Case', BillingCity = 'Berlin');
        insert acc;

        Test.setMock(HttpCalloutMock.class, new NominatimErrorMock());
        Test.startTest();
        AccountGeocodingQueue.enqueuePendingAccounts();
        Test.stopTest();

        Assert.isNotNull([
            SELECT Geocode_Cache_Timestamp__c FROM Account WHERE Id = :acc.Id
        ].Geocode_Cache_Timestamp__c);
    }

    @IsTest
    static void recentCacheIsNotReQueued() {
        Account acc = new Account(
            Name = 'Cached', BillingCity = 'Madrid',
            Geocode_Cache_Timestamp__c = System.now().addDays(-1));
        insert acc;

        Test.startTest();
        Integer queued = AccountGeocodingQueue.enqueuePendingAccounts();
        Test.stopTest();

        Assert.areEqual(0, queued, 'Accounts inside the cache window are skipped');
    }

    @IsTest
    static void accountsWithCoordinatesAreSkipped() {
        insert OppMapTestDataFactory.geoAccount('Already Geo', 1, 1);

        Test.startTest();
        Integer queued = AccountGeocodingQueue.enqueuePendingAccounts();
        Test.stopTest();

        Assert.areEqual(0, queued);
    }
}
