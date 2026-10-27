from app.trips.store import Invite


def _invite(store) -> Invite:
    return Invite(
        token=store.new_id(), owner_id=store.new_id(), trip_id=store.new_id(), email=store.new_email()
    )


def rule_saved_invite_is_found_by_token(store):
    invite = _invite(store)
    assert store.trips.get_invite(invite.token) is None
    store.trips.save_invite(invite)
    assert store.trips.get_invite(invite.token) == invite


def rule_deleted_invite_is_gone(store):
    invite = _invite(store)
    store.trips.save_invite(invite)
    store.trips.delete_invite(invite.token)
    assert store.trips.get_invite(invite.token) is None


def rule_linked_editor_sees_the_shared_trip(store):
    email, owner, trip_id = store.new_email(), store.new_id(), store.new_id()
    assert store.trips.shared_trips(email) == []
    store.trips.link_editor(email, owner, trip_id)
    assert store.trips.shared_trips(email) == [(owner, trip_id)]


def rule_unlinked_editor_no_longer_sees_it(store):
    email, owner, trip_id = store.new_email(), store.new_id(), store.new_id()
    store.trips.link_editor(email, owner, trip_id)
    store.trips.unlink_editor(email, trip_id)
    assert store.trips.shared_trips(email) == []


def rule_invites_and_editors_survive_a_restart(store):
    invite = _invite(store)
    store.trips.save_invite(invite)
    store.trips.link_editor(invite.email, invite.owner_id, invite.trip_id)
    again = store.reopen()
    assert again.trips.get_invite(invite.token) == invite
    assert again.trips.shared_trips(invite.email) == [(invite.owner_id, invite.trip_id)]
