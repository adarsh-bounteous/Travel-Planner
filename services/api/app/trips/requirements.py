from pydantic import BaseModel

# Placeholder rules seeded from the design prototype; a real medical source is out of scope.
_NONE_REPORTED = "No extra requirements"
_MEDICAL = {
    "None reported": _NONE_REPORTED,
    "No health needs to share": _NONE_REPORTED,
    "Allergies": "Carry an allergy card and any medication in its original packaging",
    "Mobility needs": "Ask for step-free transport and rooms before you book",
    "Chronic condition": "Carry a doctor's letter and prescriptions; check the destination's medication import limits",
}


class TravellerRequirement(BaseModel):
    traveller_id: str | None  # None for the owner row
    name: str
    citizenship: str
    residence: str
    health_status: str
    medical: str | None  # None when health status is blank


def medical_for(health_status: str) -> str | None:
    if not health_status:
        return None
    return _MEDICAL.get(health_status, "Check medical needs for this trip with your doctor")
