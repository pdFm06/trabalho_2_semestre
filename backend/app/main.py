from fastapi import FastAPI
from app.api.routes_files import router as files_router
from app.db.database import engine, Base

# Cria todas as tabelas na base de dados ao iniciar a aplicação.
# Se as tabelas já existirem, não faz nada (não apaga dados).
# Em produção, deves usar migrações (ex: Alembic) em vez disto.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Secure Cloud Storage")

app.include_router(files_router, prefix="/files", tags=["files"])

@app.get("/")
def root():
    return {"message": "API running"}