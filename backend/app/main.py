from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import routes_files, routes_users
from app.db.database import Base, engine


app = FastAPI(
    title="Cloud Storage API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Apenas aceitável em desenvolvimento.
# Em produção, usa Alembic migrations.
Base.metadata.create_all(bind=engine)

app.include_router(routes_files.router)
app.include_router(routes_users.router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}

@app.get("/")
def root():
    return {"message": "API running"}