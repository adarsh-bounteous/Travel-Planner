from pydantic import BaseModel

# Placeholder rules seeded from the design prototype; real visa and medical sources are out of scope.
_VISA_FREE = {
    "Japan": {
        "Australia", "Canada", "France", "Germany", "Ireland", "Japan",
        "Portugal", "United Kingdom", "United States",
    }
}
_NONE_REPORTED = "No extra requirements"
_MEDICAL = {
    "None reported": _NONE_REPORTED,
    "No health needs to share": _NONE_REPORTED,
    "Allergies": "Carry an allergy card and any medication in its original packaging",
    "Mobility needs": "Ask for step-free transport and rooms before you book",
    "Chronic condition": "Carry a doctor's letter and prescriptions; check Japan's medication import limits",
}


class TravellerRequirement(BaseModel):
    traveller_id: str | None  # None for the owner row
    name: str
    citizenship: str
    residence: str
    health_status: str
    visa: str | None  # None when citizenship or residence is blank
    medical: str | None  # None when health status is blank


def _country(destination: str | None) -> str:
    return (destination or "").rsplit(",", 1)[-1].strip()


def visa_for(destination: str | None, citizenship: str, residence: str) -> str | None:
    if not citizenship or not residence:
        return None
    free = _VISA_FREE.get(_country(destination))
    if free is None:
        return "We don't have visa advice for this destination yet."
    text = (
        "No visa needed for stays up to 90 days"
        if citizenship in free
        else "Tourist visa needed. Apply online before you travel"
    )
    if residence != citizenship:
        text += f". Carry your {residence} residence permit"
    return text


def medical_for(health_status: str) -> str | None:
    if not health_status:
        return None
    return _MEDICAL.get(health_status, "Check medical needs for this trip with your doctor")
