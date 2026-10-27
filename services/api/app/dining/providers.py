from decimal import Decimal

from app.dining.options import ProviderRestaurant


class InMemoryRestaurantProvider:
    """A provider with fixed restaurants per place."""

    def __init__(self, name: str, catalogue: dict[str, list[ProviderRestaurant]]) -> None:
        self.name = name
        self._catalogue = {key.strip().casefold(): items for key, items in catalogue.items()}

    def fetch(self, place: str) -> list[ProviderRestaurant]:
        return list(self._catalogue.get(place.strip().casefold(), []))


def _restaurant(
    city: str, name: str, cuisine: str, style: str, level: int, price: int, suits: list[str]
) -> ProviderRestaurant:
    slug = name.lower().replace(" ", "-")
    return ProviderRestaurant(
        name=name,
        city=city,
        cuisine=cuisine,
        dining_style=style,
        price_level=level,
        typical_price=Decimal(price),
        currency="EUR",
        suits=suits,
        url=f"https://example.com/restaurants/{slug}",
    )


def _lisbon(*args) -> ProviderRestaurant:
    return _restaurant("Lisbon", *args)


def _porto(*args) -> ProviderRestaurant:
    return _restaurant("Porto", *args)


# Seeded default until a maps and places adapter exists (ADR-0007): name -> catalogue.
SEED_CATALOGUES: dict[str, dict[str, list[ProviderRestaurant]]] = {
    "Seeded restaurants": {
        "lisbon": [
            _lisbon("Zaytoon Alfama", "Lebanese", "Casual", 2, 21, ["vegetarian", "halal", "gluten-free"]),
            _lisbon("Taberna da Rua Nova", "Portuguese", "Casual", 2, 22, ["vegetarian", "halal", "gluten-free"]),
            _lisbon("Casa Lima", "Portuguese", "Casual", 2, 19, ["vegetarian", "halal", "gluten-free"]),
            _lisbon("Jardim Verde", "Indian", "Casual", 1, 14, ["vegetarian", "halal", "gluten-free"]),
            _lisbon("Tasca do Tejo", "Portuguese", "Casual", 2, 20, ["vegetarian", "halal"]),
            _lisbon("Mesa Real", "Portuguese", "Fine dining", 3, 68, ["vegetarian", "halal", "gluten-free"]),
            _lisbon("Peixe e Sal", "Portuguese", "Casual", 2, 24, []),
            _lisbon("Pastel Lab", "Cafe", "Casual", 1, 9, ["vegetarian", "gluten-free"]),
        ],
        "porto": [
            _porto("Ribeira Simples", "Portuguese", "Casual", 2, 18, ["vegetarian"]),
            _porto("Forno Velho", "Portuguese", "Casual", 1, 13, ["vegetarian", "gluten-free"]),
            _porto("Casa Douro", "Italian", "Casual", 2, 23, ["vegetarian"]),
            _porto("Bistro Aliados", "French", "Fine dining", 3, 59, ["vegetarian"]),
        ],
    },
}
