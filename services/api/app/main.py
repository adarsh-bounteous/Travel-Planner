from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.config import session_secret
from app.routers import auth, health, invites, places, profile, saved_places, shared, stay_options, trips
from app.routers.deps import ApiError


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    session_secret()  # fail closed: refuse to start without a signing key
    yield


app = FastAPI(title="Trip Planner API", lifespan=lifespan)
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(trips.router)
app.include_router(stay_options.router)
app.include_router(invites.router)
app.include_router(shared.router)
app.include_router(profile.router)
app.include_router(places.router)
app.include_router(saved_places.router)


@app.exception_handler(ApiError)
def api_error(_: Request, error: ApiError) -> JSONResponse:
    return JSONResponse({"code": error.code}, status_code=error.status)
