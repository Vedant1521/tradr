import { describe, expect, it } from "bun:test";

interface RedisPriceData {
  symbol: string;
  askPrice: number;
  bidPrice: number;
  decimals: number;
  time: number;
}

function calculateSpread(
  symbolWithUsdt: string,
  scaledMidPrice: number,
  timestampMs: number,
  spreadPercentStr: string = "0.05"
): { channel: string; data: RedisPriceData } {
  const spreadPercent = Number(spreadPercentStr) / 100;
  const spreadAmount = Math.max(1, Math.floor(scaledMidPrice * spreadPercent));
  const channel = symbolWithUsdt.replace("USDT", "");

  return {
    channel,
    data: {
      symbol: channel,
      askPrice: scaledMidPrice + spreadAmount,
      bidPrice: scaledMidPrice - spreadAmount,
      decimals: 4,
      time: Math.floor(timestampMs / 1000),
    },
  };
}

describe("Price_Poller Spread & Redis Pricing Logic", () => {
  it("should calculate correct bid/ask spread around mid-price for BTC", () => {
    // BTC at $60,000 = scaled 600,000,000
    const btcMid = 600000000;
    const ts = 1700000000000;
    const result = calculateSpread("BTCUSDT", btcMid, ts, "0.05");

    expect(result.channel).toBe("BTC");
    expect(result.data.symbol).toBe("BTC");
    // 0.05% of 600,000,000 = 300,000
    const expectedSpread = Math.floor(600000000 * 0.0005);
    expect(expectedSpread).toBe(300000);
    expect(result.data.askPrice).toBe(600300000);
    expect(result.data.bidPrice).toBe(599700000);
    expect(result.data.askPrice).toBeGreaterThan(result.data.bidPrice);
    expect(result.data.decimals).toBe(4);
    expect(result.data.time).toBe(1700000000);
  });

  it("should enforce minimum spread of 1 unit for ultra-low price assets", () => {
    // Simulated low asset where spread amount would otherwise be 0
    const lowPrice = 100; // $0.0100
    const result = calculateSpread("SOLUSDT", lowPrice, 1700000000000, "0.05");

    // 0.05% of 100 = 0.05 -> floor is 0 -> Math.max(1, 0) = 1
    expect(result.data.askPrice).toBe(101);
    expect(result.data.bidPrice).toBe(99);
  });

  it("should maintain exact mid-price symmetry", () => {
    const ethMid = 30000000; // $3,000.0000
    const result = calculateSpread("ETHUSDT", ethMid, 1700000000000, "0.10");

    const spread = result.data.askPrice - ethMid;
    expect(ethMid - result.data.bidPrice).toBe(spread);
    expect((result.data.askPrice + result.data.bidPrice) / 2).toBe(ethMid);
  });
});
