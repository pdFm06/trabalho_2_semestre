import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError
from app.db.database import Base, engine
from app.api.routes import router


def init_db_with_retry(max_attempts: int = 30, delay_seconds: int = 2):
    """Aguarda o PostgreSQL estar disponível e cria as tabelas."""
    last_error = None

    for attempt in range(1, max_attempts + 1):
        try:
            Base.metadata.create_all(bind=engine)
            print("Keyserver database ready.")
            return
        except OperationalError as exc:
            last_error = exc
            print(
                f"Keyserver database not ready "
                f"({attempt}/{max_attempts}). Retrying in {delay_seconds}s..."
            )
            time.sleep(delay_seconds)

    raise last_error


app = FastAPI(title="Cloud Keyserver", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db_with_retry()


@app.get("/")
def root():
    return {"message": "Key server running"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(router)