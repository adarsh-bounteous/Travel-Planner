import unicodedata

from pydantic import BaseModel

# Seeded until a data source is chosen. One source of truth for the destination dropdown and its content,
# so a country or place without content cannot exist.


class SampleItem(BaseModel):
    name: str
    note: str


class SampleStay(SampleItem):
    price_per_night: int  # whole USD units
    currency: str = "USD"


class StarterPlace(BaseModel):
    name: str
    places: list[SampleItem]
    restaurants: list[SampleItem]
    stays: list[SampleStay]
    activities: list[SampleItem]
    medical_guidance: str  # place note, if any, then the country guidance


class StarterCountry(BaseModel):
    name: str
    places: list[StarterPlace]


def fold(text: str) -> str:
    """Lower-case without accents, like the places search."""
    decomposed = unicodedata.normalize("NFKD", text.strip().casefold())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def _items(pairs: list[tuple[str, str]]) -> list[SampleItem]:
    return [SampleItem(name=n, note=t) for n, t in pairs]


def _place(
    name: str,
    places: list[tuple[str, str]],
    restaurants: list[tuple[str, str]],
    stays: list[tuple[str, str, int]],
    activities: list[tuple[str, str]],
    country_guidance: str,
    note: str = "",
) -> StarterPlace:
    return StarterPlace(
        name=name,
        places=_items(places),
        restaurants=_items(restaurants),
        stays=[SampleStay(name=n, note=t, price_per_night=p) for n, t, p in stays],
        activities=_items(activities),
        medical_guidance=f"{note} {country_guidance}".strip(),
    )


_JAPAN = (
    "Tap water is safe. Carry any prescription medicines in their original packaging, and check that they are "
    "legal to bring in. Pharmacies are plentiful; for emergencies dial 119."
)
_PORTUGAL = (
    "Tap water is safe. No required vaccinations; keep routine ones up to date. Pharmacies display a green "
    "cross, and the EU emergency number is 112."
)
_INDIA = (
    "Drink bottled or filtered water only. Ask a travel clinic about hepatitis A, typhoid and routine boosters "
    "6 weeks before you go. Pack oral rehydration salts; emergencies dial 112."
)
_THAILAND = (
    "Drink bottled water. Ask a travel clinic about hepatitis A, typhoid and rabies. Use repellent against "
    "dengue-carrying mosquitoes. Tourist police: 1155; ambulance: 1669."
)
_MEXICO = (
    "Drink bottled or filtered water. Ask a clinic about hepatitis A and typhoid. Altitude in Mexico City can "
    "cause headaches; take it easy on day one. Emergencies dial 911."
)
_MOROCCO = (
    "Drink bottled water. Ask a clinic about hepatitis A, typhoid and tetanus. Pharmacies are easy to find in "
    "cities; emergencies dial 15 for an ambulance or 19 for police."
)
_PERU = (
    "Drink bottled or filtered water. Ask a travel clinic about hepatitis A, typhoid and yellow fever if you "
    "will visit the jungle. Pack oral rehydration salts; emergencies dial 105 for police or 116 for fire."
)

STARTER_DESTINATIONS: tuple[StarterCountry, ...] = (
    StarterCountry(
        name="Japan",
        places=[
            _place(
                "Tokyo",
                [("Senso-ji Temple", "Tokyo's oldest temple; quietest before 8am"), ("Shimokitazawa", "Vintage shops and small coffee bars")],
                [("Sushi Dai Omakase", "Counter seating, about 12 seats"), ("Ichiran Shibuya", "Solo ramen booths, open late")],
                [("Hotel Gracery Shinjuku", "Compact rooms near the station", 118), ("Sakura Hostel Asakusa", "Private rooms with shared kitchen", 54)],
                [("teamLab Planets", "Walk-through digital art, about 2 hours"), ("Sumida River cruise", "Evening boat from Asakusa")],
                _JAPAN,
                "Tokyo has English-speaking clinics in Shinjuku and Roppongi. Bring travel insurance details.",
            ),
            _place(
                "Kyoto",
                [("Fushimi Inari Shrine", "Thousands of torii gates, free entry"), ("Arashiyama Bamboo Grove", "Go early to avoid crowds")],
                [("Nishiki Market stalls", "Tofu, pickles and skewers to graze on"), ("Gion Karyu", "Kaiseki dinner in a townhouse")],
                [("Machiya Guesthouse Gion", "Restored wooden townhouse", 145), ("Kyoto Station Inn", "Quick train access", 82)],
                [("Tea ceremony", "Hosted in a Higashiyama tea house"), ("Philosopher's Path walk", "Easy 2 km canal walk")],
                _JAPAN,
            ),
            _place(
                "Osaka",
                [("Osaka Castle", "Park grounds free; museum ticketed"), ("Dotonbori", "Neon canal street, best after dark")],
                [("Takoyaki Wanaka", "Fresh octopus balls by the canal"), ("Kuromon Ichiba", "Market seafood breakfast")],
                [("Cross Hotel Osaka", "Central, rooms with city views", 126), ("Hostel Nest Namba", "Private and dorm beds", 48)],
                [("Street-food tour", "Three hours, eight tastings"), ("Universal Studios Japan", "Full-day park visit")],
                _JAPAN,
            ),
        ],
    ),
    StarterCountry(
        name="Portugal",
        places=[
            _place(
                "Lisbon",
                [("Belem Tower", "Riverside fortress, closed Mondays"), ("Alfama district", "Steep lanes and fado bars")],
                [("Pasteis de Belem", "The original custard tarts"), ("Time Out Market", "Many stalls under one roof")],
                [("Memmo Alfama", "Terrace with river views", 160), ("Lisbon Poets Hostel", "Friendly central hostel", 42)],
                [("Tram 28 ride", "Go early, it fills fast"), ("Sunset sail on the Tagus", "Two-hour small-group trip")],
                _PORTUGAL,
            ),
            _place(
                "Porto",
                [("Livraria Lello", "Ornate bookshop; ticket needed"), ("Ribeira waterfront", "Colourful riverside houses")],
                [("Cantinho do Avillez", "Modern Portuguese plates"), ("Brasao Aliados", "Francesinha sandwich classic")],
                [("Pestana Vintage Porto", "Heritage hotel on the river", 175), ("Gallery Hostel", "Quiet rooms, shared lounge", 58)],
                [("Port cellar tasting", "Cellars across the river"), ("Douro valley day trip", "Train or boat, full day")],
                _PORTUGAL,
            ),
            _place(
                "Lagos",
                [("Ponta da Piedade", "Cliffs and sea caves"), ("Praia Dona Ana", "Sheltered golden beach")],
                [("A Forja", "Grilled fish, local favourite"), ("Casa do Polvo", "Octopus rice for two")],
                [("Memmo Baleeira", "Sea-view rooms in Sagres", 150), ("Lagos Surf Hostel", "Beds near the beach", 38)],
                [("Kayak the grottos", "Two hours, all gear included"), ("Coastal boardwalk hike", "Seven Hanging Valleys trail")],
                _PORTUGAL,
            ),
        ],
    ),
    StarterCountry(
        name="India",
        places=[
            _place(
                "Delhi",
                [("Humayun's Tomb", "Gardens and Mughal architecture"), ("Chandni Chowk", "Old Delhi bazaar and spice market")],
                [("Karim's", "Mughal kebabs since 1913"), ("Indian Accent", "Modern tasting menu")],
                [("The Imperial", "Colonial grand hotel", 210), ("Zostel Delhi", "Social hostel, private rooms", 30)],
                [("Old Delhi food walk", "Three hours with a local guide"), ("Qutub Minar visit", "Sunrise slot is cooler")],
                _INDIA,
            ),
            _place(
                "Jaipur",
                [("Amber Fort", "Hilltop palace; elephant-free tickets"), ("Hawa Mahal", "Pink sandstone palace facade")],
                [("Laxmi Misthan Bhandar", "Rajasthani thali and sweets"), ("Peacock Rooftop", "Fort views at dinner")],
                [("Samode Haveli", "Restored 19th-century haveli", 120), ("Moustache Hostel", "Rooftop cafe, simple rooms", 24)],
                [("Block-printing class", "Hands-on, two hours"), ("Sunrise at Nahargarh", "Short taxi ride up")],
                _INDIA,
            ),
            _place(
                "Goa",
                [("Basilica of Bom Jesus", "UNESCO church in Old Goa"), ("Palolem Beach", "Calm crescent bay")],
                [("Fisherman's Wharf", "Goan fish curry on the river"), ("Vinayak Family", "Local thali, no frills")],
                [("Alila Diwa", "Rice-paddy resort", 150), ("Backpacker Panda", "Beach-side dorms and rooms", 22)],
                [("Spice plantation tour", "Lunch included"), ("Dolphin boat trip", "Early morning from Palolem")],
                _INDIA,
                "Beach areas: use mosquito repellent at dusk and avoid ice in drinks from roadside stalls.",
            ),
        ],
    ),
    StarterCountry(
        name="Thailand",
        places=[
            _place(
                "Bangkok",
                [("Wat Pho", "Reclining Buddha; cover shoulders"), ("Chatuchak Market", "Weekend-only, huge and hot")],
                [("Jay Fai", "Crab omelette; long queue"), ("Thip Samai", "Classic pad thai since 1966")],
                [("Riva Surya", "Riverside boutique hotel", 95), ("Lub d Siam", "Design hostel, private rooms", 28)],
                [("Khlong boat tour", "Longtail through back canals"), ("Muay Thai evening", "Live bouts at Rajadamnern")],
                _THAILAND,
            ),
            _place(
                "Chiang Mai",
                [("Doi Suthep", "Hilltop temple and view"), ("Old City moat", "Walkable temples")],
                [("Khao Soi Khun Yai", "Northern curry noodles"), ("Huen Phen", "Lanna home cooking")],
                [("Rachamankha", "Courtyard hotel", 120), ("Hostel by Bed Station", "Quiet beds in the Old City", 20)],
                [("Ethical elephant sanctuary", "Observe and feed, no riding"), ("Thai cooking class", "Market visit included")],
                _THAILAND,
            ),
            _place(
                "Phuket",
                [("Big Buddha", "Hill viewpoint, free"), ("Old Phuket Town", "Sino-Portuguese shophouses")],
                [("One Chun", "Southern Thai in a townhouse"), ("Raya", "Phuket home recipes")],
                [("Baan Yin Dee", "Boutique near Kata", 85), ("Lub d Phuket Patong", "Social hostel near the beach", 24)],
                [("Phi Phi islands trip", "Full-day speedboat"), ("Snorkelling at Racha", "Half-day boat")],
                _THAILAND,
                "Check beach flag colours before swimming: red means dangerous rip currents.",
            ),
        ],
    ),
    StarterCountry(
        name="Mexico",
        places=[
            _place(
                "Mexico City",
                [("Zocalo and Cathedral", "Main square, free to enter"), ("Frida Kahlo Museum", "Timed tickets, book ahead")],
                [("Contramar", "Seafood lunch, reserve ahead"), ("Taqueria Orinoco", "Al pastor tacos late night")],
                [("Condesa DF", "Design hotel in Condesa", 165), ("Hostel Home", "Rooftop bar, private rooms", 36)],
                [("Xochimilco trajinera", "Colourful canal boat"), ("Teotihuacan day trip", "Climb the Pyramid of the Sun")],
                _MEXICO,
            ),
            _place(
                "Oaxaca",
                [("Monte Alban", "Hilltop Zapotec ruins"), ("Santo Domingo church", "Gold baroque interior")],
                [("Casa Oaxaca", "Mole and mezcal pairings"), ("Mercado 20 de Noviembre", "Smoky grill alley")],
                [("Quinta Real Oaxaca", "Convent turned hotel", 180), ("Hostal Pochon", "Friendly courtyard hostel", 30)],
                [("Mezcal distillery visit", "Half-day in the valleys"), ("Hierve el Agua", "Natural rock pools")],
                _MEXICO,
            ),
            _place(
                "Tulum",
                [("Tulum Ruins", "Clifftop Maya site"), ("Gran Cenote", "Clear swimming cave")],
                [("Hartwood", "Wood-fired seafood"), ("Taqueria Honorio", "Cochinita pibil tacos")],
                [("Azulik", "Treehouse villas", 300), ("Posada Luna Blue", "Simple rooms near the beach", 75)],
                [("Cenote snorkel tour", "Two cenotes in a morning"), ("Sian Ka'an boat trip", "Biosphere reserve day trip")],
                _MEXICO,
                "Sun protection matters here: bring reef-safe sunscreen, which is required at cenotes.",
            ),
        ],
    ),
    StarterCountry(
        name="Morocco",
        places=[
            _place(
                "Marrakech",
                [("Jemaa el-Fnaa", "Square that comes alive at dusk"), ("Jardin Majorelle", "Cobalt-blue garden")],
                [("Nomad", "Rooftop modern Moroccan"), ("Cafe des Epices", "Mint tea above the souk")],
                [("Riad Yasmine", "Courtyard riad with pool", 110), ("Riad Dar Anika", "Budget riad, breakfast included", 55)],
                [("Hammam and scrub", "Traditional bathhouse"), ("Atlas mountains day trip", "Berber village lunch")],
                _MOROCCO,
            ),
            _place(
                "Fez",
                [("Fez el-Bali medina", "UNESCO maze; hire a guide"), ("Chouara Tannery", "View from leather shop terraces")],
                [("Cafe Clock", "Camel burger and storytelling"), ("Restaurant Nejjarine", "Palace-style dinner")],
                [("Riad Fes", "Spa riad in the medina", 190), ("Dar Seffarine", "Quiet courtyard guesthouse", 70)],
                [("Pottery workshop", "Hands-on in Ain Nokbi"), ("Medina food tour", "Four hours, local guide")],
                _MOROCCO,
            ),
            _place(
                "Chefchaouen",
                [("Blue medina", "Photogenic blue-washed lanes"), ("Kasbah Museum", "Small museum and garden")],
                [("Bab Ssour", "Tagine on a terrace"), ("Café Aladdin", "Mint tea and views")],
                [("Dar Echchaouen", "Hillside guesthouse", 85), ("Casa Perleta", "Charming boutique riad", 60)],
                [("Akchour waterfalls hike", "Half-day trail"), ("Ras el-Maa stroll", "Waterfront spring walk")],
                _MOROCCO,
            ),
        ],
    ),
    StarterCountry(
        name="Peru",
        places=[
            _place(
                "Lima",
                [("Plaza Mayor", "Colonial main square with the cathedral"), ("Miraflores Malecon", "Clifftop path over the Pacific")],
                [("Central", "Tasting menu by altitude of Peruvian ingredients"), ("La Mar Cevicheria", "Lunch-only ceviche, no reservations")],
                [("Belmond Miraflores Park", "Ocean-view hotel", 230), ("Selina Miraflores", "Social hostel with private rooms", 40)],
                [("Barranco street-art walk", "Two hours through the bohemian district"), ("Paragliding in Miraflores", "Short tandem flights over the coast")],
                _PERU,
            ),
            _place(
                "Cusco",
                [("Sacsayhuaman", "Inca fortress above the city"), ("San Pedro Market", "Fruit, cheese and bread stalls")],
                [("Cicciolina", "Andean tapas and a warm dining room"), ("Chicha por Gaston Acurio", "Modern Cusco cooking")],
                [("Palacio del Inka", "Colonial hotel near the cathedral", 200), ("Loki Cusco", "Lively hostel with private rooms", 28)],
                [("Sacred Valley day trip", "Pisac, Ollantaytambo and a buffet lunch"), ("Rainbow Mountain hike", "Very early start, high altitude")],
                _PERU,
                "Cusco sits above 3,300 m: rest on arrival, drink water and ask a doctor about altitude sickness medicine.",
            ),
            _place(
                "Arequipa",
                [("Santa Catalina Monastery", "Walled convent town in colour"), ("Plaza de Armas", "White volcanic-stone arcades")],
                [("Chicha Arequipa", "Regional dishes such as rocoto relleno"), ("Sol de Mayo", "Garden picanteria, lunch only")],
                [("Casa Andina Premium", "Central hotel with courtyard", 110), ("Wild Rover Arequipa", "Social hostel near the plaza", 22)],
                [("Colca Canyon tour", "Condor viewing, one or two days"), ("Misti volcano trek", "Guided climb, very early start")],
                _PERU,
                "Arequipa is at about 2,300 m, so take it easy on day one and use sun protection.",
            ),
        ],
    ),
)


def list_countries() -> list[str]:
    return [c.name for c in STARTER_DESTINATIONS]


def _country(name: str) -> StarterCountry | None:
    return next((c for c in STARTER_DESTINATIONS if fold(c.name) == fold(name)), None)


def places_in(country: str) -> list[str] | None:
    found = _country(country)
    return None if found is None else [p.name for p in found.places]


def content_for(country: str, place: str) -> StarterPlace | None:
    found = _country(country)
    if found is None:
        return None
    return next((p for p in found.places if fold(p.name) == fold(place)), None)
