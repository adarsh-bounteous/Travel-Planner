from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.trips.store import Trip, reconcile_days, visible_reminders

Kind = Literal["stay", "check_in", "check_out", "transport", "activity", "meal", "reminder"]
Status = Literal["booked", "unbooked"]

KIND_ORDER: list[Kind] = ["stay", "check_in", "check_out", "transport", "activity", "meal", "reminder"]


class ItineraryItem(BaseModel):
    kind: Kind
    title: str
    detail: str | None = None
    status: Status | None = None  # None for reminders
    link_text: str | None = None
    link_url: str | None = None


class ItineraryDay(BaseModel):
    number: int
    date: date
    items: list[ItineraryItem]


class Glance(BaseModel):
    booked: int
    unbooked: int


class Cover(BaseModel):
    name: str
    start_date: date | None
    end_date: date | None
    destinations: list[str]


class Itinerary(BaseModel):
    """The printable trip document. Deliberately has no money, essentials, editor or sharing field."""

    cover: Cover
    glance: Glance
    days: list[ItineraryDay]
    still_to_schedule: list[ItineraryItem]


def _http_link(url: str | None) -> str | None:
    return url if url and url.startswith(("http://", "https://")) else None


def _item(kind: Kind, title: str, detail: str | None = None, status: Status | None = None, url: str | None = None, link_text: str = "Booking page") -> ItineraryItem:
    link = _http_link(url)
    return ItineraryItem(
        kind=kind,
        title=title,
        detail=detail,
        status=status,
        link_text=link_text if link else None,
        link_url=link,
    )


def _dated_items(trip: Trip) -> list[tuple[date, ItineraryItem]]:
    """Every dated item of the trip, with the date it belongs on."""
    dated: list[tuple[date, ItineraryItem]] = []
    for stay in trip.stays:
        status: Status = "booked" if stay.chosen else "unbooked"
        nights = (stay.end_date - stay.start_date).days
        url = stay.chosen.url if stay.chosen else None
        dated.append((stay.start_date, _item("stay", stay.chosen.name if stay.chosen else stay.place, f"{nights} night{'s' if nights != 1 else ''}", status, url)))
        dated.append((stay.start_date, _item("check_in", stay.place, None, status)))
        dated.append((stay.end_date, _item("check_out", stay.place, None, status)))
    for pick in trip.transport:
        dated.append((pick.date, _item("transport", f"{pick.origin} to {pick.destination}", f"{pick.mode}, {pick.provider}", "booked", pick.url)))
    for activity in trip.activities:
        dated.append((activity.date, _item("activity", activity.name, activity.detail, "unbooked")))
    for meal in trip.restaurants:
        if meal.date is not None:
            dated.append((meal.date, _item("meal", meal.name, f"{(meal.meal or '').capitalize()}, {meal.city}", "unbooked", meal.url, "Restaurant page")))
    for reminder in visible_reminders(trip):
        dated.append((reminder.date, _item("reminder", reminder.text)))
    return dated


def _ordered(items: list[ItineraryItem]) -> list[ItineraryItem]:
    return sorted(items, key=lambda i: (KIND_ORDER.index(i.kind), i.title))


def build_itinerary(trip: Trip) -> Itinerary:
    """The trip as a document: cover, booked/unbooked counts, one entry per day, and what is still unscheduled."""
    if trip.days:
        dates = [d.date for d in trip.days]
    elif trip.start_date and trip.end_date:
        dates = [d.date for d in reconcile_days(trip.start_date, trip.end_date, [])]
    else:
        dates = []

    by_day: dict[date, list[ItineraryItem]] = {d: [] for d in dates}
    still: list[ItineraryItem] = []
    everything: list[ItineraryItem] = []
    for day, item in _dated_items(trip):
        by_day.get(day, still).append(item)
        everything.append(item)
    for meal in trip.restaurants:
        if meal.date is None:
            still.append(_item("meal", meal.name, meal.city, "unbooked", meal.url, "Restaurant page"))
            everything.append(still[-1])
    for place in trip.places:
        still.append(_item("activity", place.name))

    statuses = [i.status for i in everything]
    return Itinerary(
        cover=Cover(
            name=trip.name,
            start_date=trip.start_date,
            end_date=trip.end_date,
            destinations=[trip.destination] if trip.destination else [],
        ),
        glance=Glance(booked=statuses.count("booked"), unbooked=statuses.count("unbooked")),
        days=[ItineraryDay(number=n + 1, date=d, items=_ordered(by_day[d])) for n, d in enumerate(dates)],
        still_to_schedule=_ordered(still),
    )
