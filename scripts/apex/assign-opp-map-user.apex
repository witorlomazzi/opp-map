PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name = 'Opp_Map_User' LIMIT 1];
List<PermissionSetAssignment> existing = [SELECT Id FROM PermissionSetAssignment WHERE AssigneeId = :UserInfo.getUserId() AND PermissionSetId = :ps.Id];
if (existing.isEmpty()) {
    insert new PermissionSetAssignment(AssigneeId = UserInfo.getUserId(), PermissionSetId = ps.Id);
    System.debug('Permission Set assigned.');
} else {
    System.debug('Permission Set already assigned.');
}
