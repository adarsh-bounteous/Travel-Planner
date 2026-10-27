from app.trips.store import ShareLink


def _link(store) -> ShareLink:
    return ShareLink(token=store.new_id(), owner_id=store.new_id(), trip_id=store.new_id())


def rule_saved_link_is_found_by_token(store):
    link = _link(store)
    assert store.trips.get_share_link(link.token) is None
    store.trips.save_share_link(link)
    assert store.trips.get_share_link(link.token) == link


def rule_deleted_link_is_gone(store):
    link = _link(store)
    store.trips.save_share_link(link)
    store.trips.delete_share_link(link.token)
    assert store.trips.get_share_link(link.token) is None


def rule_links_are_found_by_their_own_token_only(store):
    first, second = _link(store), _link(store)
    store.trips.save_share_link(first)
    store.trips.save_share_link(second)
    store.trips.delete_share_link(first.token)
    assert store.trips.get_share_link(second.token) == second


def rule_share_links_survive_a_restart(store):
    link = _link(store)
    store.trips.save_share_link(link)
    assert store.reopen().trips.get_share_link(link.token) == link
