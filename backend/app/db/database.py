from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------
# O "engine" é a ligação principal à base de dados.
# create_engine() recebe a URL de ligação (definida no config.py).
# pool_pre_ping=True faz um "ping" antes de usar cada ligação,
# evitando erros quando a ligação fica inativa por muito tempo.
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)

# ---------------------------------------------------------------------------
# SessionLocal
# ---------------------------------------------------------------------------
# Uma "session" representa uma transação com a base de dados.
# SessionLocal é uma fábrica: cada vez que chamares SessionLocal(),
# crias uma nova sessão independente.
#
# autocommit=False → as alterações só são gravadas quando chamares .commit()
# autoflush=False  → não envia queries automáticas antes de cada query
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ---------------------------------------------------------------------------
# Base
# ---------------------------------------------------------------------------
# Todos os models (tabelas) herdam desta classe Base.
# O SQLAlchemy usa-a para saber quais tabelas criar/gerir.
Base = declarative_base()

# ---------------------------------------------------------------------------
# Dependência FastAPI: get_db
# ---------------------------------------------------------------------------
# Esta função é usada nas rotas com "Depends(get_db)".
# Garante que cada pedido HTTP abre uma sessão, usa-a,
# e fecha-a no final — mesmo que ocorra um erro.
def get_db():
    db = SessionLocal()
    try:
        yield db          # "entrega" a sessão à rota
    finally:
        db.close()        # fecha sempre, mesmo em caso de exceção