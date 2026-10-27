from tests.unit.store_contract import rules_profiles

def test_unsaved_profile_is_none(store):
    rules_profiles.rule_unsaved_profile_is_none(store)


def test_saved_profile_round_trips(store):
    rules_profiles.rule_saved_profile_round_trips(store)


def test_second_save_replaces_the_first(store):
    rules_profiles.rule_second_save_replaces_the_first(store)


def test_owners_have_separate_profiles(store):
    rules_profiles.rule_owners_have_separate_profiles(store)


def test_profile_survives_a_restart(store):
    rules_profiles.rule_profile_survives_a_restart(store)




def test_health_details_round_trip(store):
    rules_profiles.rule_health_details_round_trip(store)
