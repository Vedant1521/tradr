import { describe, expect, it } from "bun:test";
import { getCandelFromDb } from "../services";
import { fromInternalPrice, toInternalPrice } from "shared";

interface SyntheticTrade {
  price: number; // scaled internal
  quantity: string;
  timestamp: number;
  isBuyerMaker: boolean;
}

// Pure helper function simulating TimescaleDB continuous aggregate logic
function aggregateCandles(
  trades: SyntheticTrade[],
  bucketMinutes: number
): Array<{
  bucketTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyVol: number;
  nTrades: number;
}> {
  if (trades.length === 0) return [];

  const bucketMs = bucketMinutes * 60 * 1000;
  const groups = new Map<number, SyntheticTrade[]>();

  for (const trade of trades) {
    const bucket = Math.floor(trade.timestamp / bucketMs) * bucketMs;
    if (!groups.has(bucket)) {
      groups.set(bucket, []);
    }
    groups.get(bucket)!.push(trade);
  }

  const result = [];
  const sortedBuckets = Array.from(groups.keys()).sort((a, b) => a - b);

  for (const bucket of sortedBuckets) {
    const bucketTrades = groups.get(bucket)!;
    // Trades in chronological order
    bucketTrades.sort((a, b) => a.timestamp - b.timestamp);

    const open = bucketTrades[0]!.price;
    const close = bucketTrades[bucketTrades.length - 1]!.price;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    let takerBuyVol = 0;

    for (const t of bucketTrades) {
      if (t.price > high) high = t.price;
      if (t.price < low) low = t.price;
      const qty = parseFloat(t.quantity);
      volume += qty;
      if (!t.isBuyerMaker) {
        takerBuyVol += qty;
      }
    }

    result.push({
      bucketTime: Math.floor(bucket / 1000),
      open,
      high,
      low,
      close,
      volume,
      takerBuyVol,
      nTrades: bucketTrades.length,
    });
  }

  return result;
}

describe("TimescaleDB Candle Aggregation & Service Bounds", () => {
  it("should enforce candle mathematical invariants: high >= max(open, close) and low <= min(open, close)", () => {
    const baseMinute = Math.floor(1700000000000 / 60000) * 60000;
    const syntheticTrades: SyntheticTrade[] = [
      { price: toInternalPrice(60000), quantity: "1.0", timestamp: baseMinute + 5000, isBuyerMaker: false },
      { price: toInternalPrice(60500), quantity: "0.5", timestamp: baseMinute + 15000, isBuyerMaker: false },
      { price: toInternalPrice(59800), quantity: "2.0", timestamp: baseMinute + 35000, isBuyerMaker: true },
      { price: toInternalPrice(60200), quantity: "0.8", timestamp: baseMinute + 45000, isBuyerMaker: false },
    ];

    const candles = aggregateCandles(syntheticTrades, 1);
    expect(candles.length).toBe(1);

    const c = candles[0]!;
    expect(c.open).toBe(toInternalPrice(60000));
    expect(c.close).toBe(toInternalPrice(60200));
    expect(c.high).toBe(toInternalPrice(60500));
    expect(c.low).toBe(toInternalPrice(59800));
    expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
    expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
    expect(c.volume).toBeCloseTo(4.3, 4);
    expect(c.nTrades).toBe(4);
  });

  it("should accurately compute taker buy volume vs maker volume", () => {
    const baseMinute = Math.floor(1700000000000 / 60000) * 60000;
    const syntheticTrades: SyntheticTrade[] = [
      // Buyer is taker (isBuyerMaker: false) -> Taker Buy
      { price: toInternalPrice(60000), quantity: "1.5", timestamp: baseMinute + 1000, isBuyerMaker: false },
      { price: toInternalPrice(60050), quantity: "2.0", timestamp: baseMinute + 2000, isBuyerMaker: false },
      // Buyer is maker (isBuyerMaker: true) -> Taker Sell
      { price: toInternalPrice(59950), quantity: "3.5", timestamp: baseMinute + 3000, isBuyerMaker: true },
    ];

    const candles = aggregateCandles(syntheticTrades, 1);
    expect(candles.length).toBe(1);

    const c = candles[0]!;
    expect(c.volume).toBeCloseTo(7.0, 4);
    expect(c.takerBuyVol).toBeCloseTo(3.5, 4); // 1.5 + 2.0
    // Taker Sell = Total - Taker Buy = 3.5
    expect(c.volume - c.takerBuyVol).toBeCloseTo(3.5, 4);
  });

  it("should correctly partition multiple 1-minute buckets", () => {
    const baseTime = 1700000000000; // Minute 0
    const syntheticTrades: SyntheticTrade[] = [
      { price: toInternalPrice(60000), quantity: "1.0", timestamp: baseTime + 10000, isBuyerMaker: false },
      { price: toInternalPrice(60100), quantity: "1.0", timestamp: baseTime + 20000, isBuyerMaker: true },
      // Minute 1 (+65s)
      { price: toInternalPrice(60200), quantity: "2.0", timestamp: baseTime + 65000, isBuyerMaker: false },
      { price: toInternalPrice(60300), quantity: "2.0", timestamp: baseTime + 85000, isBuyerMaker: false },
    ];

    const candles = aggregateCandles(syntheticTrades, 1);
    expect(candles.length).toBe(2);

    expect(candles[0]!.open).toBe(toInternalPrice(60000));
    expect(candles[0]!.close).toBe(toInternalPrice(60100));

    expect(candles[1]!.open).toBe(toInternalPrice(60200));
    expect(candles[1]!.close).toBe(toInternalPrice(60300));
  });

  describe("getCandelFromDb parameter validation", () => {
    it("should return empty array when requested start time is entirely in the future", async () => {
      const futureStart = Math.floor(Date.now() / 1000) + 10000;
      const futureEnd = futureStart + 3600;

      const result = await getCandelFromDb("BTC", "1m", futureStart, futureEnd);
      expect(result).toEqual([]);
    });

    it("should throw error if startTime is greater than endTime", async () => {
      const now = Math.floor(Date.now() / 1000);
      expect(
        getCandelFromDb("BTC", "1m", now - 100, now - 500)
      ).rejects.toThrow("Invalid time range");
    });

    it("should throw error for unsupported symbol", async () => {
      const now = Math.floor(Date.now() / 1000);
      // @ts-expect-error testing invalid symbol
      expect(getCandelFromDb("DOGE", "1m", now - 3600, now)).rejects.toThrow("Invalid symbol");
    });

    it("should throw error for empty symbol", async () => {
      const now = Math.floor(Date.now() / 1000);
      // @ts-expect-error testing empty symbol
      expect(getCandelFromDb("", "1m", now - 3600, now)).rejects.toThrow("Symbol parameter is required");
    });
  });
});
