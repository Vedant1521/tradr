import { describe, expect, it } from "bun:test";
import { shouldClosePosition } from "../positionMonitor";
import type { Order } from "../../types";

describe("Position Monitor Trigger Rules (shouldClosePosition)", () => {
  const baseOrder: Order = {
    orderId: "order-123",
    userId: "user-456",
    asset: "BTC",
    type: "buy",
    margin: 100000,
    initialMargin: 100000,
    leverage: 10,
    openPrice: 600000000, // $60,000
    liquidationPrice: 540000000, // $54,000
    takeProfit: 660000000, // $66,000
    stopLoss: 570000000, // $57,000
    openTimestamp: Date.now(),
    status: "OPEN",
  };

  describe("BUY Positions", () => {
    it("should return null when price is in safe zone", () => {
      // Current price is $61,000 (between SL $57k and TP $66k)
      const decision = shouldClosePosition(baseOrder, 610000000);
      expect(decision).toBeNull();
    });

    it("should trigger take_profit when price rises to or above TP", () => {
      const decision = shouldClosePosition(baseOrder, 660000000);
      expect(decision).toEqual({ reason: "take_profit", price: 660000000 });

      const decisionAbove = shouldClosePosition(baseOrder, 670000000);
      expect(decisionAbove).toEqual({ reason: "take_profit", price: 670000000 });
    });

    it("should trigger stop_loss when price drops to or below SL", () => {
      const decision = shouldClosePosition(baseOrder, 570000000);
      expect(decision).toEqual({ reason: "stop_loss", price: 570000000 });

      const decisionBelow = shouldClosePosition(baseOrder, 560000000);
      expect(decisionBelow).toEqual({ reason: "stop_loss", price: 560000000 });
    });

    it("should trigger liquidation when price drops to or below liquidation price", () => {
      // Priority check: price at $53,000 is below both SL ($57k) and Liq ($54k).
      // Liquidation MUST take priority over stop loss!
      const decision = shouldClosePosition(baseOrder, 530000000);
      expect(decision).toEqual({ reason: "liquidation", price: 530000000 });
    });
  });

  describe("SELL Positions", () => {
    const sellOrder: Order = {
      ...baseOrder,
      type: "sell",
      openPrice: 600000000, // $60,000
      liquidationPrice: 660000000, // $66,000
      stopLoss: 630000000, // $63,000 (SL is higher price for shorts)
      takeProfit: 540000000, // $54,000 (TP is lower price for shorts)
    };

    it("should return null when short price is in safe zone", () => {
      const decision = shouldClosePosition(sellOrder, 590000000);
      expect(decision).toBeNull();
    });

    it("should trigger take_profit when price drops to or below TP for shorts", () => {
      const decision = shouldClosePosition(sellOrder, 540000000);
      expect(decision).toEqual({ reason: "take_profit", price: 540000000 });

      const decisionBelow = shouldClosePosition(sellOrder, 530000000);
      expect(decisionBelow).toEqual({ reason: "take_profit", price: 530000000 });
    });

    it("should trigger stop_loss when price rises to or above SL for shorts", () => {
      const decision = shouldClosePosition(sellOrder, 630000000);
      expect(decision).toEqual({ reason: "stop_loss", price: 630000000 });
    });

    it("should trigger liquidation when price spikes above liquidation price for shorts", () => {
      // Price at $67,000 is above both SL ($63k) and Liq ($66k).
      // Liquidation MUST take priority!
      const decision = shouldClosePosition(sellOrder, 670000000);
      expect(decision).toEqual({ reason: "liquidation", price: 670000000 });
    });
  });
});
