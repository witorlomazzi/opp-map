public with sharing class MapDisplayConfigSelector {
    @TestVisible
    private static Map_Display_Config__mdt configOverride;

    public static Map_Display_Config__mdt getConfig() {
        if (configOverride != null) {
            return configOverride;
        }
        List<Map_Display_Config__mdt> configs = [
            SELECT Fresh_Threshold_Days__c, Stale_Threshold_Days__c, Cluster_Max_Radius__c, Heatmap_Min_Amount__c
            FROM Map_Display_Config__mdt
            LIMIT 1
        ];
        if (!configs.isEmpty()) {
            return configs[0];
        }
        Map_Display_Config__mdt fallback = new Map_Display_Config__mdt(
            Fresh_Threshold_Days__c = 7,
            Stale_Threshold_Days__c = 30,
            Cluster_Max_Radius__c = 80,
            Heatmap_Min_Amount__c = 0
        );
        return fallback;
    }
}
