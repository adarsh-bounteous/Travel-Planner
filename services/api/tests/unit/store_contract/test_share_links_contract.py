from tests.unit.store_contract import rules_share_links

def test_saved_link_is_found_by_token(store):
    rules_share_links.rule_saved_link_is_found_by_token(store)


def test_deleted_link_is_gone(store):
    rules_share_links.rule_deleted_link_is_gone(store)


def test_links_are_found_by_their_own_token_only(store):
    rules_share_links.rule_links_are_found_by_their_own_token_only(store)


def test_share_links_survive_a_restart(store):
    rules_share_links.rule_share_links_survive_a_restart(store)


