from app.places.search import InMemoryPlaceSearch, Place

CATALOGUE = {
    "lisbon": [
        Place(
            id="p1",
            name="Alfama",
            image_url="/a.jpg",
            place_type="landmark",
            price="free",
            lat=38.711,
            lng=-9.130,
        )
    ]
}


def test_matching_ignores_case_and_surrounding_whitespace():
    search = InMemoryPlaceSearch(CATALOGUE)
    assert search.search(" LisBon ") == search.search("lisbon") != []


def test_unknown_destination_has_no_places():
    assert InMemoryPlaceSearch(CATALOGUE).search("Nowhereville") == []
