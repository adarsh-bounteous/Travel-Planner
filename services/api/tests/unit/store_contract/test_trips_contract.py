from tests.unit.store_contract import rules_trips

def test_save_get_list_delete_round_trip(store):
    rules_trips.rule_save_get_list_delete_round_trip(store)


def test_trip_id_alone_resolves_nothing_for_another_owner(store):
    rules_trips.rule_trip_id_alone_resolves_nothing_for_another_owner(store)


def test_budget_and_dates_round_trip(store):
    rules_trips.rule_budget_and_dates_round_trip(store)


def test_saving_again_replaces_the_trip(store):
    rules_trips.rule_saving_again_replaces_the_trip(store)


def test_trips_survive_a_restart(store):
    rules_trips.rule_trips_survive_a_restart(store)




def test_located_trip_round_trips(store):
    rules_trips.rule_located_trip_round_trips(store)
