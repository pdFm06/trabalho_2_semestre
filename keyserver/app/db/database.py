from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings

engine       = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base         = declarative_base()


def get_db():
    # Fornece uma sessão de base de dados e garante o seu encerramento no fim do pedido.
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
