from datetime import date

from app.trips.essentials import ChecklistItem, EssentialFact, ImportantNotes
from app.trips.inclusions import BookingRow, CostBlock, Money, NotIncludedItem
from app.trips.itinerary import Cover, Glance, Itinerary, ItineraryDay, ItineraryItem
from app.trips.itinerary_email import render_itinerary_html


def _itinerary(name: str = "Lisbon") -> Itinerary:
    row = BookingRow(
        id="s1", kind="stay", name="Hotel Avenida", provider="Booking", start_date=date(2026, 11, 14), end_date=date(2026, 11, 16),
        price=120.0, currency="EUR", status="confirmed", link_url="https://example.com/book", outside_trip=False,
    )
    return Itinerary(
        cover=Cover(name=name, start_date=date(2026, 11, 14), end_date=date(2026, 11, 16), destinations=["Lisbon"]),
        glance=Glance(booked=1, unbooked=1),
        days=[ItineraryDay(number=1, date=date(2026, 11, 14), items=[ItineraryItem(kind="stay", title="Hotel Avenida", status="booked", link_text="Booking page", link_url="https://example.com/book")])],
        still_to_schedule=[ItineraryItem(kind="activity", title="Alfama", status="unbooked")],
        money=Money(
            bookings=[row], included=[row],
            not_included=[NotIncludedItem(name="Stay", reason="unchosen", add_path="/trips/t1/shortlists")],
            standard_exclusions=["Tips and gratuities"],
            cost=CostBlock(currency="EUR", total=120.0, by_currency=[], conversions=[], estimates_note="Prices are estimates."),
        ),
        essentials=[EssentialFact(key="currency", label="Currency", value="Euro")],
        checklist=[ChecklistItem(key="passport", label="Passport validity", done=False)],
        notes=ImportantNotes(price_notice="Prices change.", confirm_notice="Confirm.", sources=[]),
    )


def test_every_section_is_in_the_html():
    html = render_itinerary_html(_itinerary())
    for heading in ("Day by day", "Still to schedule", "Bookings and confirmations", "Included", "Not included", "Cost summary", "Travel essentials", "Before you go", "Important notes"):
        assert heading in html
    assert "Hotel Avenida" in html and "Euro" in html


def test_values_are_escaped():
    html = render_itinerary_html(_itinerary("<script>alert(1)</script>"))
    assert "<script>" not in html and "&lt;script&gt;" in html


def test_a_fact_link_is_only_linked_for_http_urls():
    def fact_html(url: str) -> str:
        itinerary = _itinerary()
        itinerary.essentials = [EssentialFact(key="visa", label="Visa", value="Required", link_text="Apply", link_url=url)]
        return render_itinerary_html(itinerary)

    assert 'href="https://example.com/visa"' in fact_html("https://example.com/visa")
    unsafe = fact_html("javascript:alert(1)")
    assert "javascript:" not in unsafe and "Visa" in unsafe


def test_no_edit_or_add_links_and_inline_styles_only():
    html = render_itinerary_html(_itinerary())
    assert "/trips/t1" not in html and "Add to plan" not in html
    assert "<style" not in html and "var(--" not in html
