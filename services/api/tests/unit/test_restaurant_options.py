from app.dining.options import DiningFilters, gather_restaurants
from app.dining.providers import SEED_CATALOGUES, InMemoryRestaurantProvider
from app.trips.profile_store import Profile
from app.trips.store import Trip

PROVIDERS = [InMemoryRestaurantProvider(name, catalogue) for name, catalogue in SEED_CATALOGUES.items()]


def _trip(destination="Lisbon"):
    return Trip(id="t1", name="Trip", destination=destination)


def _names(filters, destination="Lisbon"):
    return {o.name for o in gather_restaurants(PROVIDERS, _trip(destination), filters).options}


def test_only_destination_restaurants():
    out = gather_restaurants(PROVIDERS, _trip("Lisbon"), DiningFilters())
    assert out.options and all(o.city == "Lisbon" for o in out.options)


def test_vegetarian_hides_restaurants_without_the_tag_and_unknown_ones():
    out = gather_restaurants(PROVIDERS, _trip(), DiningFilters(diet="Vegetarian"))
    assert out.options and all("vegetarian" in o.suits for o in out.options)
    assert "Peixe e Sal" not in {o.name for o in out.options}  # suits is empty: unknown


def test_no_restriction_diet_and_unmapped_religion_add_nothing():
    everything = _names(DiningFilters())
    assert _names(DiningFilters(diet="No restrictions", religion="No religion")) == everything
    assert _names(DiningFilters(religion="Buddhist")) == everything


def test_religion_food_rules():
    out = gather_restaurants(PROVIDERS, _trip(), DiningFilters(religion="Muslim"))
    assert out.options and all("halal" in o.suits for o in out.options)
    assert _names(DiningFilters(religion="Jewish")) == set()  # nothing verified kosher


def test_dining_style():
    out = gather_restaurants(PROVIDERS, _trip(), DiningFilters(dining_style="Casual"))
    assert {o.dining_style for o in out.options} == {"Casual"}


def test_budget_boundary_keeps_equal_level():
    out = gather_restaurants(PROVIDERS, _trip(), DiningFilters(price_level=2))
    assert max(o.price_level for o in out.options) <= 2
    assert "Casa Lima" in {o.name for o in out.options}


def test_profile_plus_trip_need_is_combined():
    out = gather_restaurants(PROVIDERS, _trip(), DiningFilters(diet="Vegetarian", extra_needs=["halal"]))
    assert out.options and all({"vegetarian", "halal"} <= set(o.suits) for o in out.options)
    assert "Pastel Lab" not in {o.name for o in out.options}


def test_home_cuisine_first_and_others_kept():
    out = gather_restaurants(PROVIDERS, _trip(), DiningFilters(home_cuisine="Portuguese"))
    cuisines = [o.cuisine for o in out.options]
    assert cuisines[0] == "Portuguese"
    assert cuisines == sorted(cuisines, key=lambda c: c != "Portuguese")  # none after another cuisine
    assert any(c != "Portuguese" for c in cuisines)
    # Without a home cuisine the catalogue order is kept, which starts with another cuisine.
    plain = gather_restaurants(PROVIDERS, _trip(), DiningFilters()).options
    assert plain[0].cuisine != "Portuguese"


def test_nothing_matching_is_empty():
    assert _names(DiningFilters(price_level=1, extra_needs=["kosher"])) == set()


def test_failing_provider_is_skipped():
    class Broken:
        name = "Broken"

        def fetch(self, place):
            raise RuntimeError("down")

    out = gather_restaurants([Broken(), *PROVIDERS], _trip(), DiningFilters())
    assert out.options


def test_existing_data_loads_with_defaults():
    assert Trip.model_validate({"id": "t", "name": "Old"}).dining_needs == []
    profile = Profile.model_validate({"diet": "Vegan"})
    assert profile.price_level is None and profile.dining_style == ""
