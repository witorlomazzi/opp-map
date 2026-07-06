public with sharing class OpportunityTeamSelector {
    @TestVisible
    private static List<TeamMemberView> teamMemberOverrides;

    public class TeamMemberView {
        @AuraEnabled public String userName;
        @AuraEnabled public String role;
    }

    /**
     * Opportunity Teams ("Team Selling") is an optional, disable-able org feature — when it's off, the
     * OpportunityTeamMember SObject type doesn't exist at all, so it can't be referenced with static Apex
     * typing (that would fail to compile in any org without the feature enabled). Fully dynamic SOQL avoids
     * that compile-time dependency, and degrades to an empty list if the object/query is unavailable.
     */
    public static List<TeamMemberView> getTeamMembers(Id opportunityId) {
        if (teamMemberOverrides != null) {
            return teamMemberOverrides;
        }

        List<TeamMemberView> result = new List<TeamMemberView>();
        try {
            List<SObject> members = Database.query(
                'SELECT User.Name, TeamMemberRole FROM OpportunityTeamMember ' +
                'WHERE OpportunityId = :opportunityId WITH USER_MODE ORDER BY TeamMemberRole'
            );
            for (SObject member : members) {
                TeamMemberView view = new TeamMemberView();
                view.userName = (String) member.getSObject('User').get('Name');
                view.role = (String) member.get('TeamMemberRole');
                result.add(view);
            }
        } catch (Exception e) {
            return new List<TeamMemberView>();
        }
        return result;
    }
}
