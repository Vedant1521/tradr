-- TimescaleDB Data Retention & Compression Policies for Tradr
-- Bounds raw tick disk usage while preserving multi-year historical candles for ML models.

-- 1. Raw Trade Hypertable Compression (compress chunks older than 7 days)
ALTER TABLE "Trade" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'symbol',
  timescaledb.compress_orderby = 'timestamp DESC'
);
SELECT add_compression_policy('"Trade"', INTERVAL '7 days', if_not_exists => TRUE);

-- 2. Raw Trade Retention Policy (auto-drop raw ticks older than 30 days)
SELECT add_retention_policy('"Trade"', INTERVAL '30 days', if_not_exists => TRUE);

-- 3. Continuous Aggregate Retention Policies
-- Retain 1-minute candles for 365 days (1 year) for short-horizon feature engineering
SELECT add_retention_policy('candles_1m', INTERVAL '365 days', if_not_exists => TRUE);

-- Retain 5-minute and 15-minute candles for 730 days (2 years)
SELECT add_retention_policy('candles_5m', INTERVAL '730 days', if_not_exists => TRUE);
SELECT add_retention_policy('candles_15m', INTERVAL '730 days', if_not_exists => TRUE);

-- Retain 1-hour candles indefinitely (or 3 years) for multi-year macro modeling
SELECT add_retention_policy('candles_1h', INTERVAL '1095 days', if_not_exists => TRUE);

-- Verify policies:
--   SELECT * FROM timescaledb_information.jobs;
