from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    # Fornece uma sessão de base de dados e garante o seu encerramento no fim do pedido.
    db = SessionLocal()
    try:
        yield db          # "entrega" a sessão à rota
    finally:
        db.close()        # fecha sempre, mesmo em caso de exceção
