import axios from "axios";
import { prisma } from "../packages/database/src/index";
import { toInternalPrice } from "../packages/shared/src/utils";

/**
 * Tradr Historical Data Backfiller
 * 
 * Fetches historical aggregate trades from Binance API and persists them
 * with isBuyerMaker flags to populate TimescaleDB continuous aggregates.
 */

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
const BATCH_SIZE = 1000;

interface BinanceAggTrade {
  a: number; // aggTradeId
  p: string; // price
  q: string; // quantity
  f: number; // first tradeId
  l: number; // last tradeId
  T: number; // timestamp
  m: boolean; // isBuyerMaker
  M: boolean; // best price match
}

export async function fetchHistoricalAggTrades(
  symbol: string,
  startTime: number,
  endTime: number,
  limit: number = BATCH_SIZE
): Promise<BinanceAggTrade[]> {
  const url = "https://api.binance.com/api/v3/aggTrades";
  const response = await axios.get<BinanceAggTrade[]>(url, {
    params: {
      symbol,
      startTime,
      endTime,
      limit,
    },
    timeout: 10000,
  });
  return response.data;
}

export async function backfillSymbolRange(
  symbol: string,
  startTimestamp: number,
  endTimestamp: number,
  onProgress?: (inserted: number, currentTs: number) => void
): Promise<number> {
  let currentStart = startTimestamp;
  let totalInserted = 0;

  console.log(`[BACKFILL] Starting backfill for ${symbol} from ${new Date(startTimestamp).toISOString()} to ${new Date(endTimestamp).toISOString()}`);

  while (currentStart < endTimestamp) {
    try {
      const windowEnd = Math.min(currentStart + 60 * 60 * 1000, endTimestamp); // 1-hour window
      const trades = await fetchHistoricalAggTrades(symbol, currentStart, windowEnd);

      if (trades.length === 0) {
        currentStart = windowEnd + 1;
        continue;
      }

      const dbTrades = trades.map((t) => ({
        tradeId: BigInt(t.a),
        symbol,
        price: BigInt(toInternalPrice(t.p)),
        quantity: t.q,
        timestamp: new Date(t.T),
        isBuyerMaker: Boolean(t.m),
      }));

      const res = await prisma.trade.createMany({
        data: dbTrades,
        skipDuplicates: true,
      });

      totalInserted += res.count;
      currentStart = trades[trades.length - 1]!.T + 1;

      if (onProgress) {
        onProgress(totalInserted, currentStart);
      }

      // Gentle pause to stay well within Binance rate limits
      await new Promise((r) => setTimeout(r, 100));
    } catch (err: any) {
      if (err.response?.status === 429) {
        console.warn("[BACKFILL] Rate limited by Binance. Waiting 30s...");
        await new Promise((r) => setTimeout(r, 30000));
      } else {
        console.error(`[BACKFILL] Error fetching batch for ${symbol}:`, err.message || err);
        currentStart += 60 * 60 * 1000; // Skip forward 1h on error
      }
    }
  }

  console.log(`[BACKFILL] Finished ${symbol}: total ${totalInserted} trades inserted.`);
  return totalInserted;
}

async function main() {
  const daysBack = parseInt(process.env.DAYS_BACK || "90", 10);
  const end = Date.now();
  const start = end - daysBack * 24 * 60 * 60 * 1000;

  console.log(`===============================================`);
  console.log(`  Tradr Historical Ingestion: Past ${daysBack} Days`);
  console.log(`===============================================`);

  for (const symbol of SYMBOLS) {
    await backfillSymbolRange(symbol, start, end, (inserted, currentTs) => {
      console.log(`  [${symbol}] ${inserted} trades inserted, at ${new Date(currentTs).toISOString()}`);
    });
  }

  // Refresh continuous aggregates if running against TimescaleDB
  try {
    console.log("[BACKFILL] Refreshing continuous aggregates...");
    await prisma.$executeRawUnsafe(
      `CALL refresh_continuous_aggregate('candles_1m', $1::timestamptz, $2::timestamptz);`,
      new Date(start).toISOString(),
      new Date(end).toISOString()
    );
    console.log("[BACKFILL] Continuous aggregates refreshed successfully!");
  } catch (err: any) {
    console.log("[BACKFILL] Note: Continuous aggregate refresh call skipped or not supported in local dev DB:", err.message);
  }

  await prisma.$disconnect();
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  });
}
