import { OrderType } from "../types";

import { OrderType } from "../types";

export function calculatePnLCents(
  openPrice: number | bigint,
  closePrice: number | bigint,
  marginCent: number | bigint,
  leverage: number | bigint,
  side: OrderType | string
): number {
  const MONEY_SCALE = 100n;
  const PRICE_SCALE = 10000n;
  const CONVERSION_FACTOR = PRICE_SCALE / MONEY_SCALE; // = 100

  let profitandLoss: bigint = 0n;
  const op = typeof openPrice === "bigint" ? openPrice : BigInt(Math.round(openPrice));
  const cp = typeof closePrice === "bigint" ? closePrice : BigInt(Math.round(closePrice));
  const mc = typeof marginCent === "bigint" ? marginCent : BigInt(Math.round(marginCent));
  const lg = typeof leverage === "bigint" ? leverage : BigInt(Math.round(leverage));

  if (op === 0n || mc === 0n || lg === 0n) {
    return 0;
  }

  // Convert margin to PRICE_SCALE first
  const marginOnPriceScale = mc * CONVERSION_FACTOR;
  const PositionValue = marginOnPriceScale * lg; // position value (margin × leverage)

  // Calculating price difference
  const buyPrice: bigint = cp - op; // Profit/Loss for LONG (buy) positions
  const sellPrice: bigint = op - cp; // Profit/Loss for SHORT (sell) positions

  const normalizedSide = side.toLowerCase();
  if (normalizedSide === "buy") {
    profitandLoss = (PositionValue * buyPrice) / op;
  } else if (normalizedSide === "sell") {
    profitandLoss = (PositionValue * sellPrice) / op;
  }

  // Convert back from PRICE_SCALE to USD_SCALE (cents)
  const finalPnL = profitandLoss / CONVERSION_FACTOR;

  return Number(finalPnL);
}

// Calculation of liquidation price
export function calculateLiquidation(
  openPrice: number | bigint,
  leverage: number | bigint,
  side: OrderType | string
): number {
  const op = typeof openPrice === "bigint" ? openPrice : BigInt(Math.round(openPrice));
  const lg = typeof leverage === "bigint" ? leverage : BigInt(Math.round(leverage));

  if (lg === 0n) return 0;

  let liquidationPrice: bigint = 0n;
  const normalizedSide = side.toLowerCase();

  if (normalizedSide === "buy") {
    liquidationPrice = (op * (lg - 1n)) / lg;
  } else if (normalizedSide === "sell") {
    liquidationPrice = (op * (lg + 1n)) / lg;
  }

  return Number(liquidationPrice);
}

