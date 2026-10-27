from collections.abc import AsyncIterator
from datetime import date
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.config import get_settings, session_secret
from app.local_seed import run_first_start_seed
from app.routers import (
    auth,
    deps,
    flight_shortlist,
    health,
    invites,
    local_inbox,
    local_mode,
    local_reset,
    places,
    profile,
    rates,
    saved_places,
    shared,
    startup_status,
    stay_options,
    transport,
    transport_picks,
    travel_search,
    trips,
)
from app.routers.deps import ApiError


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    session_secret()  # fail closed: refuse to start without a signing key
    settings = get_settings()  # fail closed: refuse to start with local mode on outside the local environment
    if settings.local_mode:
        deps._local_trips()  # build now, so an unreadable data file stops startup, not the first request
        deps._local_profiles()
        run_first_start_seed(deps.get_local_seed_target(), date.today())
    yield


app = FastAPI(title="Trip Planner API", lifespan=lifespan)
app.include_router(health.router)
app.include_router(startup_status.router)
app.include_router(auth.router)
app.include_router(trips.router)
app.include_router(stay_options.router)
app.include_router(flight_shortlist.router)
app.include_router(transport.router)
app.include_router(transport_picks.router)
app.include_router(invites.router)
app.include_router(shared.router)
app.include_router(local_inbox.router)
app.include_router(local_reset.router)
app.include_router(local_mode.router)
app.include_router(travel_search.router)
app.include_router(profile.router)
app.include_router(places.router)
app.include_router(saved_places.router)
app.include_router(rates.router)


@app.exception_handler(ApiError)
def api_error(_: Request, error: ApiError) -> JSONResponse:
    return JSONResponse({"code": error.code}, status_code=error.status)
