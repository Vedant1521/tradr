import pytest
from tradr_ml.db.engine import SessionLocal

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
