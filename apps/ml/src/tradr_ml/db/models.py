from sqlalchemy.orm import declarative_base, mapped_column, Mapped
from sqlalchemy import MetaData, Integer, String, JSON, DateTime, ForeignKey, Float
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from datetime import datetime
from tradr_ml.config import settings

# Bind metadata to the ml schema
metadata = MetaData(schema=settings.ML_SCHEMA)
Base = declarative_base(metadata=metadata)

class FeatureSet(Base):
    __tablename__ = "feature_sets"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    definition_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)

class Feature1m(Base):
    __tablename__ = "features_1m"
    
    ts: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), primary_key=True)
    symbol: Mapped[str] = mapped_column(String(50), primary_key=True)
    feature_set_id: Mapped[int] = mapped_column(Integer, ForeignKey("feature_sets.id"), primary_key=True)
    values: Mapped[dict] = mapped_column(JSONB, nullable=False)
