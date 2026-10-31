from datetime import date
from html import escape

from app.trips.essentials import EssentialFact
from app.trips.inclusions import BookingRow
from app.trips.itinerary import Itinerary, ItineraryItem

# Email clients ignore CSS custom properties, so these are the resolved values of the tokens in
# design-system/tokens.css. This is the only place raw colour values appear; keep them in step with that file.
_COLOURS = {
    "fg": "#0f172a",  # --color-fg
    "muted": "#475569",  # --color-fg-muted
    "border": "#cbd5e1",  # --color-border
    "surface": "#f1f5f9",  # --color-surface
    "primary": "#0e7490",  # --color-primary
}

_BODY = f"margin:0;padding:24px;background:{_COLOURS['surface']};color:{_COLOURS['fg']};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5"
_CARD = f"max-width:720px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid {_COLOURS['border']};border-radius:8px"
_H2 = f"margin:32px 0 8px;font-size:20px;color:{_COLOURS['primary']}"
_H3 = "margin:16px 0 4px;font-size:16px"
_MUTED = f"color:{_COLOURS['muted']};font-size:14px"
_CELL = f"padding:8px;border-bottom:1px solid {_COLOURS['border']};text-align:left;vertical-align:top"

KIND_LABELS = {
    "stay": "Stay", "check_in": "Check-in", "check_out": "Check-out", "transport": "Transport",
    "activity": "Activity", "meal": "Meal", "reminder": "Reminder",
}


def _e(value: object) -> str:
    return escape(str(value))


def _day(d: date | None) -> str:
    return d.strftime("%a %d %b %Y") if d else ""


def _money(amount: float, currency: str) -> str:
    return f"{amount:,.2f} {_e(currency)}"


def _section(title: str, body: str) -> str:
    return f'<h2 style="{_H2}">{_e(title)}</h2>{body}'


def _list(lines: list[str]) -> str:
    return '<ul style="margin:0;padding-left:20px">' + "".join(f"<li>{line}</li>" for line in lines) + "</ul>"


def _items(items: list[ItineraryItem]) -> str:
    if not items:
        return f'<p style="{_MUTED}">Not yet planned</p>'
    status = {"booked": " (Booked)", "unbooked": " (Unbooked)", None: ""}
    return _list([
        f"<strong>{_e(KIND_LABELS[i.kind])}</strong>: {_e(i.title)}{', ' + _e(i.detail) if i.detail else ''}{status[i.status]}"
        for i in items
    ])


def _bookings(rows: list[BookingRow]) -> str:
    if not rows:
        return f'<p style="{_MUTED}">Nothing booked yet</p>'
    head = "".join(f'<th style="{_CELL}">{h}</th>' for h in ("Item", "Provider", "Dates", "Price"))
    body = ""
    for b in rows:
        dates = "Unscheduled" if not b.start_date or not b.end_date else (_day(b.start_date) if b.start_date == b.end_date else f"{_day(b.start_date)} to {_day(b.end_date)}")
        price = _money(b.price, b.currency) if b.price is not None and b.currency else "No price"
        cells = (_e(b.name), _e(b.provider or "—"), _e(dates), price)
        body += "<tr>" + "".join(f'<td style="{_CELL}">{c}</td>' for c in cells) + "</tr>"
    return f'<table style="width:100%;border-collapse:collapse"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'


def _fact(fact: EssentialFact) -> str:
    value = "Not yet planned" if fact.value is None else fact.value
    detail = f"<br>{_e(fact.detail)}" if fact.value is not None and fact.detail else ""
    link = f'<br><a href="{_e(fact.link_url)}" style="color:{_COLOURS["primary"]}">{_e(fact.link_text or fact.link_url)}</a>' if fact.link_url else ""
    source = f"Source: {_e(fact.source)}. Checked {_day(fact.as_of)}." if fact.source and fact.as_of else "No source or date yet"
    return f'<strong>{_e(fact.label)}</strong>: {_e(value)}{detail}{link}<br><span style="{_MUTED}">{source}</span>'


def render_itinerary_html(itinerary: Itinerary) -> str:
    """The whole itinerary as one self-contained HTML email: inline styles, escaped values, no edit or add links."""
    cover, money = itinerary.cover, itinerary.money
    dates = f"{_day(cover.start_date)} to {_day(cover.end_date)}" if cover.start_date and cover.end_date else ""
    parts = [
        f'<h1 style="margin:0 0 4px;font-size:28px">{_e(cover.name)}</h1>',
        f'<p style="{_MUTED};margin:0">{_e(", ".join(cover.destinations))}{" · " if cover.destinations and dates else ""}{_e(dates)}</p>',
        f'<p style="{_MUTED}">Booked: {itinerary.glance.booked}. Unbooked: {itinerary.glance.unbooked}.</p>',
    ]
    days = "".join(
        f'<h3 style="{_H3}">Day {d.number} <span style="{_MUTED}">{_e(_day(d.date))}</span></h3>{_items(d.items)}' for d in itinerary.days
    )
    parts.append(_section("Day by day", days or f'<p style="{_MUTED}">Not yet planned</p>'))
    parts.append(_section("Still to schedule", _items(itinerary.still_to_schedule)))
    parts.append(_section("Bookings and confirmations", _bookings(money.bookings)))
    parts.append(_section("Included", _list([f"{_e(r.name)}: {_money(r.price or 0, r.currency or money.cost.currency)}" for r in money.included]) if money.included else f'<p style="{_MUTED}">Nothing included yet</p>'))
    not_included = _list([_e(n.name) + (" (Unpriced)" if n.reason == "unpriced" else "") for n in money.not_included]) if money.not_included else ""
    parts.append(_section("Not included", not_included + f'<h3 style="{_H3}">Usually not covered by a trip plan</h3>' + _list([_e(x) for x in money.standard_exclusions])))
    cost = money.cost
    cost_lines = [f"<strong>Total in trip currency</strong>: {_money(cost.total, cost.currency)}"]
    cost_lines += [f"{_e(t.currency)}: {_money(t.total, t.currency)}" for t in cost.by_currency]
    cost_lines += [f"{_e(c.currency)} converted to {_e(cost.currency)} at 1 {_e(c.currency)} = {c.rate} {_e(cost.currency)}, rate from {_day(c.rate_date)}." for c in cost.conversions]
    parts.append(_section("Cost summary", _list(cost_lines) + f'<p style="{_MUTED}">{_e(cost.estimates_note)}</p>'))
    parts.append(_section("Travel essentials", _list([_fact(f) for f in itinerary.essentials])))
    done = sum(c.done for c in itinerary.checklist)
    checklist = _list([f"{_e(c.label)}: {'Done' if c.done else 'Not done'}" + (f' <span style="{_MUTED}">{_e(c.hint)}</span>' if c.hint else "") for c in itinerary.checklist])
    parts.append(_section("Before you go", f'<p style="{_MUTED}">{done} of 6 done</p>{checklist}'))
    notes = itinerary.notes
    sources = [f"{_e(s.label)}: {_e(s.source)}, {_day(s.as_of)}" for s in notes.sources]
    parts.append(_section("Important notes", f"<p><strong>{_e(notes.price_notice)}</strong></p><p><strong>{_e(notes.confirm_notice)}</strong></p>" + f'<h3 style="{_H3}">Data sources and dates used</h3>' + _list(sources)))
    return (
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
        f"<title>{_e(cover.name)}</title></head>"
        f'<body style="{_BODY}"><div style="{_CARD}">{"".join(parts)}</div></body></html>'
    )
