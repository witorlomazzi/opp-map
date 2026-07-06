@IsTest
private class OpportunityTeamSelectorTest {
    @IsTest
    static void testGetTeamMembersUsesOverrideWhenSet() {
        Id fakeOppId = Schema.Opportunity.SObjectType.getDescribe().getKeyPrefix() + '000000000001AAA';
        OpportunityTeamSelector.TeamMemberView fakeMember = new OpportunityTeamSelector.TeamMemberView();
        fakeMember.userName = 'Fulano de Tal';
        fakeMember.role = 'Account Manager';
        OpportunityTeamSelector.teamMemberOverrides = new List<OpportunityTeamSelector.TeamMemberView>{ fakeMember };

        Test.startTest();
        List<OpportunityTeamSelector.TeamMemberView> result = OpportunityTeamSelector.getTeamMembers(fakeOppId);
        Test.stopTest();

        System.assertEquals(1, result.size());
        System.assertEquals('Fulano de Tal', result[0].userName);
    }

    @IsTest
    static void testGetTeamMembersDegradesGracefullyWithoutOverride() {
        Opportunity opp = new Opportunity(Name = 'Team Test Opp', StageName = 'Prospecting', CloseDate = Date.today().addDays(10));
        insert opp;

        Test.startTest();
        // Opportunity Teams may or may not be enabled in the running org; either way this must not throw.
        List<OpportunityTeamSelector.TeamMemberView> result = OpportunityTeamSelector.getTeamMembers(opp.Id);
        Test.stopTest();

        System.assertNotEquals(null, result);
    }
}
