from tests.unit.store_contract import rules_invites

def test_saved_invite_is_found_by_token(store):
    rules_invites.rule_saved_invite_is_found_by_token(store)


def test_deleted_invite_is_gone(store):
    rules_invites.rule_deleted_invite_is_gone(store)


def test_linked_editor_sees_the_shared_trip(store):
    rules_invites.rule_linked_editor_sees_the_shared_trip(store)


def test_unlinked_editor_no_longer_sees_it(store):
    rules_invites.rule_unlinked_editor_no_longer_sees_it(store)


def test_invites_and_editors_survive_a_restart(store):
    rules_invites.rule_invites_and_editors_survive_a_restart(store)


