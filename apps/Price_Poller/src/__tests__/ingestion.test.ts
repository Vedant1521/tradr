import { describe, expect, it } from "bun:test";
import { toInternalPrice, fromInternalPrice } from "shared";
import type { Trades } from "../binance";

// Binance aggregate trade parser helper (matching binance.ts logic)
function parseAggTrade(rawJson: string): Trades | null {
  const message_ws = JSON.parse(rawJson);
  if (message_ws.e !== "aggTrade") return null;

  return {
    tradeId: message_ws.a,
    symbol: message_ws.s,
    price: toInternalPrice(message_ws.p),
    quantity: message_ws.q,
    timestamp: message_ws.T,
    isBuyerMaker: Boolean(message_ws.m),
  };
}

describe("Price_Poller Ingestion & isBuyerMaker Extraction", () => {
  it("should extract isBuyerMaker as true when buyer is maker (m: true)", () => {
    const binancePayload = JSON.stringify({
      e: "aggTrade",
      E: 1672531200000,
      s: "BTCUSDT",
      a: 12345678,
      p: "65432.5000",
      q: "0.15000000",
      f: 100,
      l: 105,
      T: 1672531199999,
      m: true, // buyer is maker -> seller is taker (market sell)
      M: true,
    });

    const parsed = parseAggTrade(binancePayload);
    expect(parsed).not.toBeNull();
    expect(parsed!.tradeId).toBe(12345678);
    expect(parsed!.symbol).toBe("BTCUSDT");
    expect(parsed!.price).toBe(654325000); // 65432.5 * 10000
    expect(parsed!.quantity).toBe("0.15000000");
    expect(parsed!.timestamp).toBe(1672531199999);
    expect(parsed!.isBuyerMaker).toBe(true);
  });

  it("should extract isBuyerMaker as false when buyer is taker (m: false)", () => {
    const binancePayload = JSON.stringify({
      e: "aggTrade",
      E: 1672531201000,
      s: "ETHUSDT",
      a: 98765432,
      p: "3456.7800",
      q: "2.50000000",
      f: 200,
      l: 202,
      T: 1672531200999,
      m: false, // buyer is taker (market buy)
      M: true,
    });

    const parsed = parseAggTrade(binancePayload);
    expect(parsed).not.toBeNull();
    expect(parsed!.tradeId).toBe(98765432);
    expect(parsed!.symbol).toBe("ETHUSDT");
    expect(parsed!.price).toBe(34567800);
    expect(parsed!.isBuyerMaker).toBe(false);
  });

  it("should ignore non-aggTrade event messages", () => {
    const pingPayload = JSON.stringify({
      e: "depthUpdate",
      E: 1672531202000,
      s: "BTCUSDT",
    });

    const parsed = parseAggTrade(pingPayload);
    expect(parsed).toBeNull();
  });

  it("should accurately scale prices and preserve precision", () => {
    const rawPrice = "98765.4321";
    const scaled = toInternalPrice(rawPrice);
    expect(scaled).toBe(987654321);

    const roundtrip = fromInternalPrice(scaled);
    expect(roundtrip).toBe(98765.4321);
  });
});
