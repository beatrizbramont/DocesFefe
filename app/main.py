from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app import migracoes
from app.config import APP_DIR, settings
from app.database import Base, engine
from app.routers import admin, public
from app.seed import popular_produtos


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    migracoes.aplicar()
    popular_produtos()
    yield


app = FastAPI(title=settings.loja_nome, lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(SessionMiddleware, secret_key=settings.secret_key, https_only=False)
app.mount("/static", StaticFiles(directory=APP_DIR / "static"), name="static")
app.include_router(public.router)
app.include_router(admin.router)


@app.exception_handler(RequestValidationError)
async def erro_de_validacao(request: Request, exc: RequestValidationError):
    """Devolve a primeira mensagem em português, em vez do JSON cru do Pydantic."""
    primeiro = exc.errors()[0]
    msg = primeiro.get("msg", "Dados inválidos.")
    msg = msg.removeprefix("Value error, ")
    return JSONResponse(status_code=422, content={"detail": msg})
