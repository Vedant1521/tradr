import { describe, expect, it } from "bun:test";
import { calculateLiquidation } from "../PnL";

describe("Liquidation Calculation (calculateLiquidation)", () => {
  // Test parameters:
  // openPrice: $50,000 (scaled by 10000 = 500,000,000)
  const openPrice = 500000000n; // $50,000

  describe("BUY Orders", () => {
    it("should calculate liquidation price strictly below open price", () => {
      const liqPrice = calculateLiquidation(openPrice, 10, "BUY");
      expect(liqPrice < openPrice).toBe(true);
    });

    it("should calculate exact liquidation for 10x BUY", () => {
      // Formula: openPrice * (10 - 1) / 10 = openPrice * 9 / 10 = $45,000
      const liqPrice = calculateLiquidation(openPrice, 10, "BUY");
      expect(liqPrice).toBe(450000000);
    });

    it("should calculate exact liquidation for 20x BUY", () => {
      // Formula: openPrice * (20 - 1) / 20 = openPrice * 19 / 20 = $47,500
      const liqPrice = calculateLiquidation(openPrice, 20, "BUY");
      expect(liqPrice).toBe(475000000);
    });

    it("should calculate exact liquidation for 100x BUY", () => {
      // Formula: openPrice * (100 - 1) / 100 = openPrice * 99 / 100 = $49,500
      const liqPrice = calculateLiquidation(openPrice, 100, "BUY");
      expect(liqPrice).toBe(495000000);
    });

    it("should calculate 0 liquidation price for 1x BUY (cannot liquidate until price hits zero)", () => {
      // Formula: openPrice * (1 - 1) / 1 = 0
      const liqPrice = calculateLiquidation(openPrice, 1, "BUY");
      expect(liqPrice).toBe(0);
    });
  });

  describe("SELL Orders", () => {
    it("should calculate liquidation price strictly above open price", () => {
      const liqPrice = calculateLiquidation(openPrice, 10, "SELL");
      expect(liqPrice > Number(openPrice)).toBe(true);
    });

    it("should calculate exact liquidation for 10x SELL", () => {
      // Formula: openPrice * (10 + 1) / 10 = openPrice * 11 / 10 = $55,000
      const liqPrice = calculateLiquidation(openPrice, 10, "SELL");
      expect(liqPrice).toBe(550000000);
    });

    it("should calculate exact liquidation for 20x SELL", () => {
      // Formula: openPrice * (20 + 1) / 20 = openPrice * 21 / 20 = $52,500
      const liqPrice = calculateLiquidation(openPrice, 20, "SELL");
      expect(liqPrice).toBe(525000000);
    });

    it("should calculate exact liquidation for 100x SELL", () => {
      // Formula: openPrice * (100 + 1) / 100 = openPrice * 101 / 100 = $50,500
      const liqPrice = calculateLiquidation(openPrice, 100, "SELL");
      expect(liqPrice).toBe(505000000);
    });

    it("should calculate 2x openPrice for 1x SELL (100% loss occurs at 2x price)", () => {
      // Formula: openPrice * (1 + 1) / 1 = 2 * openPrice = $100,000
      const liqPrice = calculateLiquidation(openPrice, 1, "SELL");
      expect(liqPrice).toBe(1000000000);
    });
  });
});
