import unicodedata

from app.places.search import Place, PlaceType, Price

# name, place type, price, lat/lng offset from the destination centre
_Template = tuple[str, PlaceType, Price, float, float]

# destination key -> (centre lat, centre lng, templates)
_DESTINATIONS: dict[str, tuple[float, float, list[_Template]]] = {
    "lisbon": (
        38.7223,
        -9.1393,
        [
            ("Miradouro da Graça", "landmark", "free", 0.004, 0.003),
            ("Time Out Market", "food", "moderate", -0.012, -0.006),
            ("Pastéis de Belém Walk", "food", "budget", -0.030, -0.075),
            ("Tile Museum", "museum", "budget", 0.010, 0.040),
        ],
    ),
    "kyoto": (
        35.0116,
        135.7681,
        [
            ("Bamboo Path Walk", "park", "free", 0.045, -0.100),
            ("Nishiki Market", "food", "moderate", 0.002, -0.004),
            ("Fushimi Shrine Gates", "landmark", "free", -0.040, 0.010),
            ("Gion Craft Shops", "shopping", "premium", 0.005, 0.020),
        ],
    ),
    "paris": (
        48.8566,
        2.3522,
        [
            ("Seine Riverside Walk", "park", "free", 0.001, 0.010),
            ("Musée de Cluny", "museum", "budget", -0.006, -0.008),
            ("Marais Boutiques", "shopping", "moderate", 0.003, 0.012),
        ],
    ),
}

# A data URI, so showing a generated place never makes a request to any host.
PLACEHOLDER_IMAGE = (
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E"
    "%3Crect width='400' height='300' fill='%23e5e7eb'/%3E%3C/svg%3E"
)


def _fold(text: str) -> str:
    """Case, accents and surrounding or repeated whitespace do not matter when matching."""
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return " ".join("".join(c for c in decomposed if not unicodedata.combining(c)).split())


def _slug(text: str) -> str:
    return "-".join(_fold(text).split())


class LocalPlaceSearch:
    """Local mode's places stand-in: places generated from the destination, no outside request."""

    def search(self, destination: str) -> list[Place]:
        key = _fold(destination)
        if key not in _DESTINATIONS:
            return []
        lat, lng, templates = _DESTINATIONS[key]
        return [
            Place(
                id=f"{key}-{_slug(name)}",
                name=name,
                image_url=PLACEHOLDER_IMAGE,
                place_type=place_type,
                price=price,
                lat=round(lat + d_lat, 4),
                lng=round(lng + d_lng, 4),
            )
            for name, place_type, price, d_lat, d_lng in templates
        ]
