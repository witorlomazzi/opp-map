// Ad-hoc performance check against OpportunityMapSelector with ~1,700
// geolocated opportunities loaded via Bulk API (see gen-bulk-data.js).
// Not a unit test: prints elapsed wall-clock ms and governor usage per call.
List<OppMapFilters> scenarios = new List<OppMapFilters>();

scenarios.add(new OppMapFilters()); // no filters

OppMapFilters minAmountFilter = new OppMapFilters();
minAmountFilter.minAmount = 250000;
scenarios.add(minAmountFilter);

OppMapFilters stageFilter = new OppMapFilters();
stageFilter.stages = new List<String>{ 'Closed Won', 'Closed Lost' };
scenarios.add(stageFilter);

OppMapFilters bboxFilter = new OppMapFilters();
OppMapFilters.Bbox bbox = new OppMapFilters.Bbox();
bbox.south = -35; bbox.north = 10; bbox.west = -75; bbox.east = -35; // South America
bboxFilter.bbox = bbox;
scenarios.add(bboxFilter);

OppMapFilters tagFilter = new OppMapFilters();
OppMapFilters.MultiPicklistFilter mp = new OppMapFilters.MultiPicklistFilter();
mp.field = 'Tag__c';
mp.values = new List<String>{ 'Estrategica', 'Urgente' };
mp.mode = 'any';
tagFilter.multipicklist = new List<OppMapFilters.MultiPicklistFilter>{ mp };
scenarios.add(tagFilter);

List<String> labels = new List<String>{
    'No filters (500 cap)', 'minAmount >= 250000', 'stages IN (Closed Won, Closed Lost)',
    'bbox South America', 'multipicklist Tag__c any'
};

for (Integer i = 0; i < scenarios.size(); i++) {
    Integer startCpu = Limits.getCpuTime();
    Integer startQueries = Limits.getQueries();
    Integer startQueryRows = Limits.getQueryRows();
    Long startMs = System.currentTimeMillis();
    OpportunityMapSelector.MapResult result = OpportunityMapSelector.search(scenarios[i]);
    Long elapsedMs = System.currentTimeMillis() - startMs;
    System.debug(LoggingLevel.INFO,
        '[' + labels[i] + '] returned=' + result.returnedCount +
        ' truncated=' + result.truncated +
        ' wallMs=' + elapsedMs +
        ' cpuMsDelta=' + (Limits.getCpuTime() - startCpu) +
        ' queriesDelta=' + (Limits.getQueries() - startQueries) +
        ' queryRowsDelta=' + (Limits.getQueryRows() - startQueryRows) +
        ' totalQueryRows=' + Limits.getQueryRows() + '/' + Limits.getLimitQueryRows()
    );
}
