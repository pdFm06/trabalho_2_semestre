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

Base.metadata.create_all(bind=engine)

app.include_router(routes_files.router)
app.include_router(routes_users.router)


@app.get("/health")
def health_check() -> dict[str, str]:
    # Devolve o estado do serviço para verificações de saúde.
    return {"status": "ok"}

@app.get("/")
def root():
    # Devolve uma resposta simples para confirmar que o serviço está ativo.
    return {"message": "API running"}
