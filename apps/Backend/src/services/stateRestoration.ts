import { prisma, type User as DbUser, type ActiveOrder as DbActiveOrder } from "database";
import { StoreData, orderStorageMap, emailToUserId } from "../data/store";
import type { Asset, Leverage } from "shared";
import type { Order, OrderType } from "../types";

export async function restoreState(): Promise<void> {
  try {
    console.log("[RESTORE] Starting state restoration from database...");
    const startTime = Date.now();

    // 1. Load all users from users table
    const users: DbUser[] = await prisma.user.findMany();

    users.forEach((user: DbUser) => {
      StoreData.set(user.userId, {
        userId: user.userId,
        email: user.email,
        password: user.password || "", // Handle OAuth users with empty password
        balance: { usd_balance: user.balanceCents },
        assets: {} as Record<Asset, number>,
      });
      // Populate emailToUserId map for findUser() to work after restart
      emailToUserId.set(user.email, user.userId);
    });

    console.log(`[RESTORE] Loaded ${users.length} users into memory`);

    // 2. Load active orders from database
    const activeOrders: DbActiveOrder[] = await prisma.activeOrder.findMany();

    // Load orders into orderStorageMap
    activeOrders.forEach((order: DbActiveOrder) => {
      let userOrders = orderStorageMap.get(order.userId);
      if (!userOrders) {
        userOrders = new Map<string, Order>();
        orderStorageMap.set(order.userId, userOrders);
      }

      userOrders.set(order.orderId, {
        orderId: order.orderId,
        userId: order.userId,
        asset: order.asset as Asset,
        type: order.type as OrderType,
        margin: order.margin,
        initialMargin: order.initialMargin ?? order.margin,
        addedMargin: order.addedMargin,
        leverage: order.leverage as Leverage,
        openPrice: order.openPrice,
        liquidationPrice: order.liquidationPrice,
        takeProfit: order.takeProfit ?? undefined,
        stopLoss: order.stopLoss ?? undefined,
        openTimestamp: order.openedAt.getTime(),
        trailingStopLoss: order.trailingStopLossEnabled
          ? {
              enabled: true,
              trailingDistance: order.trailingStopLossDistance ?? 0,
              highestPrice: order.trailingStopLossHighestPrice ?? undefined,
              lowestPrice: order.trailingStopLossLowestPrice ?? undefined,
            }
          : undefined,
      });
    });

    console.log(
      `[RESTORE] State restored: ${users.length} users, ${activeOrders.length} active orders in ${Date.now() - startTime}ms`
    );
  } catch (error) {
    console.error("[RESTORE] Error restoring state:", error);
    throw error;
  }
}
