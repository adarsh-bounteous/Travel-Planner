from app.trips.profile_store import Profile, TransportPreferences


def rule_unsaved_profile_is_none(store):
    assert store.profiles.get_profile(store.new_id()) is None


def rule_saved_profile_round_trips(store):
    owner = store.new_id()
    profile = Profile(
        display_name="Ana", home_city="Lisbon", tastes=["food", "art"], citizenship="Portugal",
        transport_preferences=TransportPreferences(modes=["train"], cabin="economy", max_stops=1, providers=["Atlantic Air"]),
    )
    store.profiles.save_profile(owner, profile)
    assert store.profiles.get_profile(owner) == profile


def rule_second_save_replaces_the_first(store):
    owner = store.new_id()
    store.profiles.save_profile(owner, Profile(display_name="Ana", home_city="Lisbon"))
    store.profiles.save_profile(owner, Profile(display_name="Bo"))
    assert store.profiles.get_profile(owner) == Profile(display_name="Bo")


def rule_owners_have_separate_profiles(store):
    owner, other = store.new_id(), store.new_id()
    store.profiles.save_profile(owner, Profile(display_name="Ana"))
    assert store.profiles.get_profile(other) is None


def rule_profile_survives_a_restart(store):
    owner = store.new_id()
    store.profiles.save_profile(owner, Profile(display_name="Ana"))
    assert store.reopen().profiles.get_profile(owner) == Profile(display_name="Ana")


def rule_health_details_round_trip(store):
    owner = store.new_id()
    profile = Profile(vaccinations_had=["Hepatitis A"], pregnant=True)
    store.profiles.save_profile(owner, profile)
    saved = store.profiles.get_profile(owner)
    assert saved.vaccinations_had == ["Hepatitis A"] and saved.pregnant is True
