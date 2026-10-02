import { describe, expect, it } from "bun:test";
import { calculatePnLCents } from "../PnL";

describe("PnL Calculation (calculatePnLCents)", () => {
  // Test parameters:
  // openPrice: $60,000 (scaled by 10000 = 600,000,000)
  // marginCent: $1,000 (100,000 cents)
  // leverage: 10x

  const openPrice = 600000000n; // $60,000
  const marginCent = 100000;    // $1,000 in cents
  const leverage = 10;

  describe("BUY Orders", () => {
    it("should calculate positive PnL when price increases", () => {
      // Price rises 5% from $60,000 to $63,000 (+ $3,000)
      // With 10x leverage, PnL should be +50% of margin = +$500 = +50,000 cents
      const closePrice = 630000000n;
      const pnl = calculatePnLCents(openPrice, closePrice, marginCent, leverage, "BUY");
      expect(pnl).toBe(50000);
    });

    it("should calculate negative PnL when price decreases", () => {
      // Price drops 3% from $60,000 to $58,200 (- $1,800)
      // With 10x leverage, PnL should be -30% of margin = -$300 = -30,000 cents
      const closePrice = 582000000n;
      const pnl = calculatePnLCents(openPrice, closePrice, marginCent, leverage, "BUY");
      expect(pnl).toBe(-30000);
    });

    it("should return 0 PnL when closePrice equals openPrice", () => {
      const pnl = calculatePnLCents(openPrice, openPrice, marginCent, leverage, "BUY");
      expect(pnl).toBe(0);
    });

    it("should handle 100x leverage correctly without integer overflow", () => {
      // 1% price increase with 100x leverage = 100% profit
      const highLeverage = 100;
      const closePrice = 606000000n; // +1%
      const pnl = calculatePnLCents(openPrice, closePrice, marginCent, highLeverage, "BUY");
      expect(pnl).toBe(100000); // +$1000 = 100,000 cents
    });

    it("should handle 1x leverage accurately", () => {
      // 10% price increase with 1x leverage = 10% profit
      const closePrice = 660000000n; // +10%
      const pnl = calculatePnLCents(openPrice, closePrice, marginCent, 1, "BUY");
      expect(pnl).toBe(10000); // +$100 = 10,000 cents
    });
  });

  describe("SELL Orders", () => {
    it("should calculate positive PnL when price decreases", () => {
      // Price drops 5% from $60,000 to $57,000 (- $3,000)
      // With 10x leverage, SELL PnL should be +50% = +$500 = +50,000 cents
      const closePrice = 570000000n;
      const pnl = calculatePnLCents(openPrice, closePrice, marginCent, leverage, "SELL");
      expect(pnl).toBe(50000);
    });

    it("should calculate negative PnL when price increases", () => {
      // Price rises 4% from $60,000 to $62,400 (+ $2,400)
      // With 10x leverage, SELL PnL should be -40% = -$400 = -40,000 cents
      const closePrice = 624000000n;
      const pnl = calculatePnLCents(openPrice, closePrice, marginCent, leverage, "SELL");
      expect(pnl).toBe(-40000);
    });

    it("should return 0 PnL when closePrice equals openPrice on SELL", () => {
      const pnl = calculatePnLCents(openPrice, openPrice, marginCent, leverage, "SELL");
      expect(pnl).toBe(0);
    });
  });

  describe("Edge Cases", () => {
    it("should return 0 if marginCent is 0", () => {
      const pnl = calculatePnLCents(openPrice, 650000000n, 0, leverage, "BUY");
      expect(pnl).toBe(0);
    });

    it("should maintain BigInt precision across fractional basis point movements", () => {
      // 0.01% price move ($60,000 -> $60,006)
      const closePrice = 600060000n;
      const pnl = calculatePnLCents(openPrice, closePrice, marginCent, 10, "BUY");
      // 0.01% * 10 = 0.1% of $1,000 = $1 = 100 cents
      expect(pnl).toBe(100);
    });
  });
});
