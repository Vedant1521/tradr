from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://user:XYZ%40123@localhost:5432/trades_db"
    REDIS_URL: str = "redis://localhost:6379/0"
    KAFKA_BROKERS: str = "localhost:9092"
    KAFKA_TOPIC: str = "trades"
    ML_SCHEMA: str = "ml"
    
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
