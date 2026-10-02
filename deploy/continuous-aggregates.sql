-- TimescaleDB Continuous Aggregates for Multi-Timeframe Candlesticks
-- Pre-aggregates raw trades into 1m, 5m, 15m, and 1h candlesticks with order-flow volume.

-- 1. 1-Minute Continuous Aggregate (candles_1m)
CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', "timestamp") AS bucket,
    symbol,
    first(price, "timestamp") AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, "timestamp") AS close,
    sum(quantity) AS volume,
    count(*) AS n_trades,
    sum(CASE WHEN "isBuyerMaker" = false THEN quantity ELSE 0 END) AS taker_buy_vol
FROM "Trade"
GROUP BY bucket, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('candles_1m',
    start_offset => INTERVAL '2 hours',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists => TRUE);

-- 2. 5-Minute Continuous Aggregate (candles_5m)
CREATE MATERIALIZED VIEW IF NOT EXISTS candles_5m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('5 minutes', "timestamp") AS bucket,
    symbol,
    first(price, "timestamp") AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, "timestamp") AS close,
    sum(quantity) AS volume,
    count(*) AS n_trades,
    sum(CASE WHEN "isBuyerMaker" = false THEN quantity ELSE 0 END) AS taker_buy_vol
FROM "Trade"
GROUP BY time_bucket('5 minutes', "timestamp"), symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('candles_5m',
    start_offset => INTERVAL '6 hours',
    end_offset => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '5 minutes',
    if_not_exists => TRUE);

-- 3. 15-Minute Continuous Aggregate (candles_15m)
CREATE MATERIALIZED VIEW IF NOT EXISTS candles_15m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('15 minutes', "timestamp") AS bucket,
    symbol,
    first(price, "timestamp") AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, "timestamp") AS close,
    sum(quantity) AS volume,
    count(*) AS n_trades,
    sum(CASE WHEN "isBuyerMaker" = false THEN quantity ELSE 0 END) AS taker_buy_vol
FROM "Trade"
GROUP BY time_bucket('15 minutes', "timestamp"), symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('candles_15m',
    start_offset => INTERVAL '12 hours',
    end_offset => INTERVAL '15 minutes',
    schedule_interval => INTERVAL '15 minutes',
    if_not_exists => TRUE);

-- 4. 1-Hour Continuous Aggregate (candles_1h)
CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1h
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', "timestamp") AS bucket,
    symbol,
    first(price, "timestamp") AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, "timestamp") AS close,
    sum(quantity) AS volume,
    count(*) AS n_trades,
    sum(CASE WHEN "isBuyerMaker" = false THEN quantity ELSE 0 END) AS taker_buy_vol
FROM "Trade"
GROUP BY time_bucket('1 hour', "timestamp"), symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('candles_1h',
    start_offset => INTERVAL '1 day',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE);
