from app.places.search import Place


def _place(place_id: str, name: str = "Colosseum") -> Place:
    return Place(
        id=place_id, name=name, image_url="https://img.example/a.jpg", place_type="landmark",
        price="free", lat=41.89, lng=12.49,
    )


def rule_saved_place_is_listed_with_all_fields(store):
    owner = store.new_id()
    place = _place(store.new_id())
    assert store.saved.list_saved(owner) == []
    store.saved.save(owner, place)
    assert store.saved.list_saved(owner) == [place]


def rule_saving_twice_keeps_one_entry(store):
    owner, place_id = store.new_id(), store.new_id()
    store.saved.save(owner, _place(place_id))
    store.saved.save(owner, _place(place_id, "Renamed"))
    assert [p.name for p in store.saved.list_saved(owner)] == ["Renamed"]


def rule_unsave_removes_the_place(store):
    owner, place_id = store.new_id(), store.new_id()
    store.saved.save(owner, _place(place_id))
    store.saved.unsave(owner, place_id)
    assert store.saved.list_saved(owner) == []


def rule_unsave_of_an_absent_place_is_fine(store):
    store.saved.unsave(store.new_id(), store.new_id())


def rule_owners_have_separate_saved_places(store):
    owner, other = store.new_id(), store.new_id()
    store.saved.save(owner, _place(store.new_id()))
    assert store.saved.list_saved(other) == []


def rule_saved_places_survive_a_restart(store):
    owner = store.new_id()
    place = _place(store.new_id())
    store.saved.save(owner, place)
    assert store.reopen().saved.list_saved(owner) == [place]
