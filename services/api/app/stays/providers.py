from collections.abc import Callable
from datetime import date, datetime
from decimal import Decimal

from app.stays.options import Amenity, ProviderListing, PropertyType


class InMemoryStayProvider:
    """A provider with fixed listings per place; the clock stamps each listing as it is fetched."""

    def __init__(
        self, name: str, catalogue: dict[str, list[ProviderListing]], clock: Callable[[], datetime]
    ) -> None:
        self.name = name
        self._catalogue = {key.strip().casefold(): listings for key, listings in catalogue.items()}
        self._clock = clock

    def fetch(self, place: str, start: date, end: date) -> list[ProviderListing]:
        fetched_at = self._clock()
        return [
            x.model_copy(update={"fetched_at": fetched_at})
            for x in self._catalogue.get(place.strip().casefold(), [])
        ]


_EPOCH = datetime(2000, 1, 1)  # replaced by the clock at fetch time


def _listing(
    slug: str,
    name: str,
    kind: PropertyType,
    rooms: int,
    stars: int,
    area: str,
    amenities: list[Amenity],
    price: int,
    nearby: bool = False,
) -> ProviderListing:
    return ProviderListing(
        property_name=name,
        property_type=kind,
        rooms=rooms,
        stars=stars,
        area=area,
        amenities=amenities,
        nearby=nearby,
        price_per_night=Decimal(price),
        currency="EUR",
        fetched_at=_EPOCH,
        url=f"https://example.com/stays/{slug}",
    )


_ALFAMA = ("Hotel Alfama Terrace", "hotel", 1, 4, "Alfama", ["wifi", "breakfast", "ac"])
_MIRADOURO = ("Casa do Miradouro", "homestay", 1, 0, "Graça", ["wifi", "breakfast"])
_BAIXA = ("Baixa Grand Hotel", "hotel", 1, 5, "Baixa", ["wifi", "breakfast", "pool", "parking", "ac"])
_ROSSIO = ("Pensão Rossio", "hotel", 1, 2, "Baixa", ["wifi"])
_RIVERSIDE = ("Lisbon Riverside Suites", "hotel", 2, 4, "Belém", ["wifi", "parking", "pool", "ac"])
_LOFT = ("Bairro Alto Loft", "other", 1, 0, "Bairro Alto", ["wifi", "ac"])
_FLAT = ("Family Flat Estrela", "other", 2, 0, "Estrela", ["wifi", "parking"])
_SINTRA = ("Quinta de Sintra Hotel", "hotel", 1, 4, "Sintra, 35 minutes away", ["wifi", "breakfast", "pool", "parking"])
_CASCAIS = ("Cascais Bay Hotel", "hotel", 1, 3, "Cascais, 40 minutes away", ["wifi", "ac", "pool"])
_AZUL = ("Casa Azul Cascais", "homestay", 1, 0, "Cascais, 40 minutes away", ["wifi", "breakfast"])


def _offer(slug: str, prop: tuple, price: int) -> ProviderListing:
    nearby = "minutes away" in prop[4]
    return _listing(slug, *prop, price, nearby)


# Seeded default until a stay provider is chosen.
SEED_CATALOGUES: dict[str, dict[str, list[ProviderListing]]] = {
    "Booknest": {
        "lisbon": [
            _offer("booknest-alfama", _ALFAMA, 118),
            _offer("booknest-baixa", _BAIXA, 215),
            _offer("booknest-riverside", _RIVERSIDE, 260),
            _offer("booknest-flat", _FLAT, 146),
            _offer("booknest-sintra", _SINTRA, 88),
            _offer("booknest-cascais", _CASCAIS, 104),
        ]
    },
    "Staylink": {
        "lisbon": [
            _offer("staylink-alfama", _ALFAMA, 124),
            _offer("staylink-miradouro", _MIRADOURO, 79),
            _offer("staylink-riverside", _RIVERSIDE, 255),
            _offer("staylink-loft", _LOFT, 96),
            _offer("staylink-sintra", _SINTRA, 92),
            _offer("staylink-azul", _AZUL, 67),
        ]
    },
    "Roomly": {
        "lisbon": [
            _offer("roomly-miradouro", _MIRADOURO, 74),
            _offer("roomly-baixa", _BAIXA, 209),
            _offer("roomly-rossio", _ROSSIO, 62),
            _offer("roomly-loft", _LOFT, 98),
            _offer("roomly-flat", _FLAT, 140),
            _offer("roomly-cascais", _CASCAIS, 99),
            _offer("roomly-azul", _AZUL, 71),
        ]
    },
}
