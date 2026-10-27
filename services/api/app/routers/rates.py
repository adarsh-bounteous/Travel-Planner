from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.routers.deps import get_current_user, get_rates
from app.trips.rates import OFFERED_CURRENCIES, RateSource

router = APIRouter(prefix="/rates")

WHOLE_UNIT_CURRENCIES = {"JPY"}


def _unsupported_message(from_code: str, to_code: str) -> str:
    unsupported = [c for c in dict.fromkeys((from_code, to_code)) if c not in OFFERED_CURRENCIES]
    supported = f"Supported currencies: {', '.join(OFFERED_CURRENCIES)}."
    if not unsupported:
        return f"No rate is available from {from_code} to {to_code}. {supported}"
    verb = "is" if len(unsupported) == 1 else "are"
    return f"{' and '.join(unsupported)} {verb} not supported. {supported}"


@router.get("/convert")
def convert(
    amount: Decimal,
    from_currency: Annotated[str, Query(alias="from", min_length=3, max_length=3)],
    to_currency: Annotated[str, Query(alias="to", min_length=3, max_length=3)],
    _: str = Depends(get_current_user),
    rates: RateSource = Depends(get_rates),
) -> dict:
    from_code, to_code = from_currency.upper(), to_currency.upper()
    rate = rates.rate(from_code, to_code)
    if rate is None or from_code not in OFFERED_CURRENCIES or to_code not in OFFERED_CURRENCIES:
        return {"supported": False, "message": _unsupported_message(from_code, to_code)}
    places = Decimal(1) if to_code in WHOLE_UNIT_CURRENCIES else Decimal("0.01")
    converted = (amount * rate).quantize(places, rounding=ROUND_HALF_UP)
    return {"supported": True, "amount": float(converted), "currency": to_code, "rate": float(rate)}
