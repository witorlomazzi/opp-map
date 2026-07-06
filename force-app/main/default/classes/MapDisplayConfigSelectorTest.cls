@IsTest
private class MapDisplayConfigSelectorTest {
    @IsTest
    static void testGetConfigReturnsRealDeployedRecord() {
        Test.startTest();
        Map_Display_Config__mdt config = MapDisplayConfigSelector.getConfig();
        Test.stopTest();

        System.assertNotEquals(null, config);
        System.assertEquals(7, config.Fresh_Threshold_Days__c);
        System.assertEquals(30, config.Stale_Threshold_Days__c);
    }

    @IsTest
    static void testGetConfigUsesOverrideWhenSet() {
        MapDisplayConfigSelector.configOverride = new Map_Display_Config__mdt(
            Fresh_Threshold_Days__c = 3, Stale_Threshold_Days__c = 10, Cluster_Max_Radius__c = 50, Heatmap_Min_Amount__c = 1000
        );

        Test.startTest();
        Map_Display_Config__mdt config = MapDisplayConfigSelector.getConfig();
        Test.stopTest();

        System.assertEquals(3, config.Fresh_Threshold_Days__c);
        System.assertEquals(10, config.Stale_Threshold_Days__c);
    }
}
