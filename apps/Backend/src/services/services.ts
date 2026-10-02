import { TimeDurationCandel, Candle, ValidSymbol } from "../types";
import { fromInternalPrice } from "shared";
import { prisma } from "database";

export async function getCandelFromDb(
  symbol: ValidSymbol,
  interval: TimeDurationCandel,
  startTime: number,
  endTime: number
): Promise<Candle[]> {
  const IntervalConfig: Record<
    TimeDurationCandel,
    { minutes: number; pgInterval: string; caggView?: string }
  > = {
    "1m": { minutes: 1, pgInterval: "1 minute", caggView: "candles_1m" },
    "5m": { minutes: 5, pgInterval: "5 minutes", caggView: "candles_5m" },
    "15m": { minutes: 15, pgInterval: "15 minutes", caggView: "candles_15m" },
    "1h": { minutes: 60, pgInterval: "1 hour", caggView: "candles_1h" },
    "1d": { minutes: 1440, pgInterval: "1 day" },
    "1w": { minutes: 10080, pgInterval: "1 week" },
  };

  const config = IntervalConfig[interval];
  if (!config) {
    throw new Error(`Unsupported interval: ${interval}`);
  }

  // Validate asset symbol
  if (!symbol || symbol.trim() === "") {
    throw new Error("Symbol parameter is required");
  }

  const now = Math.floor(Date.now() / 1000);

  // If requesting entirely future data, return empty array
  if (startTime > now) {
    console.log(`[CANDLES] Future data requested for ${symbol} (start: ${startTime}, now: ${now}), returning empty`);
    return [];
  }

  // Clamp endTime to current time
  if (endTime > now) {
    console.log(`[CANDLES] endTime ${endTime} is in future, clamping to now ${now}`);
    endTime = now;
  }

  // Check startTime <= endTime
  if (startTime > endTime) {
    console.error(`[CANDLES] Invalid time range: startTime (${startTime}) > endTime (${endTime})`);
    throw new Error("Invalid time range: startTime must be before or equal to endTime");
  }

  const SymbolMap = {
    BTC: "BTCUSDT",
    ETH: "ETHUSDT",
    SOL: "SOLUSDT",
  } as const;

  const dbSymbol = SymbolMap[symbol as keyof typeof SymbolMap];
  if (!dbSymbol) {
    throw new Error("Invalid symbol. Supported: BTC, ETH, SOL");
  }

  const rangeDuration = (endTime - startTime) / 1000 / 60; // in minutes
  const expectedCandles = rangeDuration / config.minutes;
  if (expectedCandles > 1000) {
    // Limit to 1000 most recent candles
    startTime = endTime - 1000 * config.minutes * 60 * 1000;
    console.log(
      `Too many candles requested (${expectedCandles}). Limiting to 1000 most recent candles.`
    );
  }

  const startDate = new Date(startTime * 1000);
  const endDate = new Date(endTime * 1000);

  console.log(`[CANDLES] Querying ${dbSymbol} ${interval} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

  let results: any[] = [];

  // Strategy A: Fast-path continuous aggregate scan
  if (config.caggView) {
    try {
      results = await prisma.$queryRawUnsafe(`
        SELECT
          bucket AS time,
          open,
          high,
          low,
          close,
          volume
        FROM "${config.caggView}"
        WHERE symbol = $1
          AND bucket >= $2
          AND bucket <= $3
        ORDER BY bucket ASC
        LIMIT 1000
      `, dbSymbol, startDate, endDate);
    } catch (caggErr: any) {
      console.warn(`[CANDLES] Continuous aggregate ${config.caggView} query failed (${caggErr.message}), falling back to raw hypertable aggregation`);
      results = [];
    }
  }

  // Strategy B: Hypertable aggregation fallback (or for 1d, 1w intervals)
  if (!results || results.length === 0) {
    try {
      results = await prisma.$queryRawUnsafe(`
        SELECT
          time_bucket(INTERVAL '${config.pgInterval}', timestamp) AS time,
          (array_agg(price ORDER BY timestamp))[1] AS open,
          MAX(price) AS high,
          MIN(price) AS low,
          (array_agg(price ORDER BY timestamp DESC))[1] AS close,
          SUM(CAST(quantity AS DECIMAL)) AS volume
        FROM "Trade"
        WHERE symbol = $1
          AND timestamp >= $2
          AND timestamp <= $3
        GROUP BY time_bucket(INTERVAL '${config.pgInterval}', timestamp)
        ORDER BY time ASC
        LIMIT 1000
      `, dbSymbol, startDate, endDate);
    } catch (fallbackErr: any) {
      console.error(`[CANDLES] Fallback query failed:`, fallbackErr);
      return [];
    }
  }

  if (!results || results.length === 0) {
    console.warn(`[CANDLES] No candles found for ${dbSymbol} from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    return [];
  }

  const candles: Candle[] = results.map((row) => ({
    time: Math.floor(new Date(row.time).getTime() / 1000),
    open: fromInternalPrice(Number(row.open)),
    high: fromInternalPrice(Number(row.high)),
    low: fromInternalPrice(Number(row.low)),
    close: fromInternalPrice(Number(row.close)),
    volume: row.volume ? row.volume.toString() : "0",
  }));

  console.log(`[CANDLES] Returning ${candles.length} candles for ${dbSymbol} ${interval}`);
  return candles;
}
