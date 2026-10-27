from tests.unit.store_contract import rules_saved_places

def test_saved_place_is_listed_with_all_fields(store):
    rules_saved_places.rule_saved_place_is_listed_with_all_fields(store)


def test_saving_twice_keeps_one_entry(store):
    rules_saved_places.rule_saving_twice_keeps_one_entry(store)


def test_unsave_removes_the_place(store):
    rules_saved_places.rule_unsave_removes_the_place(store)


def test_unsave_of_an_absent_place_is_fine(store):
    rules_saved_places.rule_unsave_of_an_absent_place_is_fine(store)


def test_owners_have_separate_saved_places(store):
    rules_saved_places.rule_owners_have_separate_saved_places(store)


def test_saved_places_survive_a_restart(store):
    rules_saved_places.rule_saved_places_survive_a_restart(store)


