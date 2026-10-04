from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from tradr_ml.config import settings

# Create synchronous engine for migrations and backfills
engine = create_engine(settings.DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
