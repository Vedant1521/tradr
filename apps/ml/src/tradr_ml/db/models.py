from sqlalchemy.orm import declarative_base
from sqlalchemy import MetaData
from tradr_ml.config import settings

# Bind metadata to the ml schema
metadata = MetaData(schema=settings.ML_SCHEMA)
Base = declarative_base(metadata=metadata)
