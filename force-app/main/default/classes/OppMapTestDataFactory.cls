@IsTest
public class OppMapTestDataFactory {
    public static Account geoAccount(String name, Decimal lat, Decimal lng) {
        return new Account(
            Name = name,
            BillingLatitude = lat,
            BillingLongitude = lng,
            BillingCity = 'City of ' + name,
            BillingCountry = 'Brazil'
        );
    }

    public static Opportunity opp(Id accountId, String name, Decimal amount, String stage, Date closeDate) {
        return new Opportunity(
            Name = name,
            AccountId = accountId,
            Amount = amount,
            StageName = stage,
            CloseDate = closeDate
        );
    }

    public static Id setupProductWithEntry(String productName) {
        Product2 prod = new Product2(Name = productName, IsActive = true);
        insert prod;
        insert new PricebookEntry(
            Pricebook2Id = Test.getStandardPricebookId(),
            Product2Id = prod.Id,
            UnitPrice = 100,
            IsActive = true
        );
        return prod.Id;
    }

    public static void addLineItem(Id oppId, Id productId) {
        PricebookEntry pbe = [
            SELECT Id FROM PricebookEntry
            WHERE Product2Id = :productId AND Pricebook2Id = :Test.getStandardPricebookId()
            LIMIT 1
        ];
        insert new OpportunityLineItem(
            OpportunityId = oppId,
            PricebookEntryId = pbe.Id,
            Quantity = 1,
            UnitPrice = 100
        );
    }
}
