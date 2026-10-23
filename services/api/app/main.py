from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import session_secret
from app.routers import auth, health


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    session_secret()  # fail closed: refuse to start without a signing key
    yield


app = FastAPI(title="Trip Planner API", lifespan=lifespan)
app.include_router(health.router)
app.include_router(auth.router)
