import { describe, expect, it } from "bun:test";
import {
  toInternalPrice,
  fromInternalPrice,
  toInternalUSD,
  fromInternalUSD,
  PRICE_SCALE,
  USD_SCALE,
} from "../index";

describe("Shared Scaling Utilities", () => {
  it("should have correct scaling constants", () => {
    expect(PRICE_SCALE).toBe(10000);
    expect(USD_SCALE).toBe(100);
  });

  describe("Price Scaling", () => {
    it("should convert float price to internal scaled integer", () => {
      expect(toInternalPrice(65432.12)).toBe(654321200);
      expect(toInternalPrice(1.0)).toBe(10000);
      expect(toInternalPrice(0.0001)).toBe(1);
    });

    it("should convert internal scaled number or BigInt back to float price", () => {
      expect(fromInternalPrice(654321200)).toBe(65432.12);
      expect(fromInternalPrice(654321200n)).toBe(65432.12); // BigInt from Prisma
      expect(fromInternalPrice(10000)).toBe(1.0);
      expect(fromInternalPrice(10000n)).toBe(1.0);
    });

    it("should round-trip cleanly without precision loss", () => {
      const prices = [100.5, 62145.89, 3125.45, 0.05];
      for (const p of prices) {
        const scaled = toInternalPrice(p);
        const unscaled = fromInternalPrice(scaled);
        expect(unscaled).toBeCloseTo(p, 4);
      }
    });
  });

  describe("USD Cents Scaling", () => {
    it("should convert dollar amount to internal cents", () => {
      expect(toInternalUSD(5000)).toBe(500000);
      expect(toInternalUSD(10.5)).toBe(1050);
      expect(toInternalUSD(0.01)).toBe(1);
    });

    it("should convert internal cents back to dollars", () => {
      expect(fromInternalUSD(500000)).toBe(5000);
      expect(fromInternalUSD(1050)).toBe(10.5);
    });
  });
});
