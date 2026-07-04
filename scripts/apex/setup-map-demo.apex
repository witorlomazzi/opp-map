// Dataset de demonstração: contas geolocalizadas em 3 continentes com
// oportunidades variadas (estágio, valor, tags) para exercitar todos os filtros.
List<Account> accounts = new List<Account>{
    // América do Sul
    new Account(Name = 'Aurora Tech SP', BillingCity = 'São Paulo', BillingCountry = 'Brazil',
        BillingLatitude = -23.5505, BillingLongitude = -46.6333),
    new Account(Name = 'Andes Mining', BillingCity = 'Santiago', BillingCountry = 'Chile',
        BillingLatitude = -33.4489, BillingLongitude = -70.6693),
    new Account(Name = 'Pampa Foods', BillingCity = 'Buenos Aires', BillingCountry = 'Argentina',
        BillingLatitude = -34.6037, BillingLongitude = -58.3816),
    // Europa
    new Account(Name = 'Lisboa Digital', BillingCity = 'Lisboa', BillingCountry = 'Portugal',
        BillingLatitude = 38.7223, BillingLongitude = -9.1393),
    new Account(Name = 'Berlin Robotics', BillingCity = 'Berlin', BillingCountry = 'Germany',
        BillingLatitude = 52.52, BillingLongitude = 13.405),
    new Account(Name = 'Madrid Solar', BillingCity = 'Madrid', BillingCountry = 'Spain',
        BillingLatitude = 40.4168, BillingLongitude = -3.7038),
    // Ásia / Oceania
    new Account(Name = 'Tokyo Devices', BillingCity = 'Tokyo', BillingCountry = 'Japan',
        BillingLatitude = 35.6762, BillingLongitude = 139.6503),
    new Account(Name = 'Singapore Cloud', BillingCity = 'Singapore', BillingCountry = 'Singapore',
        BillingLatitude = 1.3521, BillingLongitude = 103.8198),
    // Sem coordenadas: candidata à geocodificação assíncrona
    new Account(Name = 'Pending Geo Ltda', BillingStreet = 'Av. Paulista, 1000',
        BillingCity = 'São Paulo', BillingCountry = 'Brazil')
};
insert accounts;

List<String> stages = new List<String>{ 'Prospecting', 'Qualification', 'Closed Won', 'Closed Lost' };
List<String> tags = new List<String>{ 'Estrategica', 'Renovacao', 'Upsell', 'Estrategica;Urgente' };
List<Opportunity> opps = new List<Opportunity>();
Integer i = 0;
for (Account acc : accounts) {
    if (acc.BillingLatitude == null) { continue; }
    for (Integer j = 0; j < 3; j++) {
        opps.add(new Opportunity(
            Name = acc.Name + ' - Deal ' + (j + 1),
            AccountId = acc.Id,
            StageName = stages[Math.mod(i, stages.size())],
            Amount = 10000 * (Math.mod(i, 10) + 1),
            CloseDate = Date.today().addDays(Math.mod(i, 4) == 2 ? -30 : 30 + i),
            Tag__c = tags[Math.mod(i, tags.size())]
        ));
        i++;
    }
}
insert opps;
System.debug('Created ' + accounts.size() + ' accounts and ' + opps.size() + ' opportunities.');
