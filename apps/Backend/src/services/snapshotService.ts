import { prisma } from "database";
import { StoreData, orderStorageMap } from "../data/store";
import { SnapShot_Interval } from "../types";

const SNAPSHOT_INTERVAL = 10000; // 10 seconds
let snapshotTimer: NodeJS.Timeout | null = null;

async function saveSnapshot() {
  try {
    const startTime = Date.now();

    // 1. Save user balances
    const users = Array.from(StoreData.values());
    const userSnapshots = users.map((user) => ({
      userId: user.userId,
      balanceCents: user.balance.usd_balance,
    }));

    if (userSnapshots.length > 0) {
      await prisma.userSnapshot.createMany({
        data: userSnapshots,
      });
    }

    // 2. Save open orders
    const allOrders: any[] = [];
    orderStorageMap.forEach((userOrders) => {
      userOrders.forEach((order) => {
        allOrders.push({
          orderId: order.orderId,
          userId: order.userId,
          asset: order.asset,
          type: order.type,
          margin: order.margin,
          initialMargin: order.initialMargin,
          addedMargin: order.addedMargin || 0,
          leverage: order.leverage,
          openPrice: order.openPrice,
          liquidationPrice: order.liquidationPrice,
          takeProfit: order.takeProfit || null,
          stopLoss: order.stopLoss || null,
          openedAt: new Date(order.openTimestamp),
          trailingStopLossEnabled: order.trailingStopLoss?.enabled || false,
          trailingStopLossDistance: order.trailingStopLoss?.trailingDistance || null,
          trailingStopLossHighestPrice: order.trailingStopLoss?.highestPrice || null,
          trailingStopLossLowestPrice: order.trailingStopLoss?.lowestPrice || null,
        });
      });
    });

    if (allOrders.length > 0) {
      await prisma.orderSnapshot.createMany({
        data: allOrders,
      });
    }

    const duration = Date.now() - startTime;
    console.log(
      `[SNAPSHOT] Saved ${userSnapshots.length} users, ${allOrders.length} orders in ${duration}ms`
    );
  } catch (error) {
    console.error("[SNAPSHOT] Error saving snapshot:", error);
  }
}

const PRUNE_INTERVAL = 3600000; // 1 hour
let pruneTimer: NodeJS.Timeout | null = null;

async function pruneOldSnapshots() {
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const deletedUsers = await prisma.userSnapshot.deleteMany({
      where: { snapshotAt: { lt: cutoff } },
    });
    const deletedOrders = await prisma.orderSnapshot.deleteMany({
      where: { snapshotAt: { lt: cutoff } },
    });
    if (deletedUsers.count > 0 || deletedOrders.count > 0) {
      console.log(
        `[SNAPSHOT PRUNE] Pruned ${deletedUsers.count} user snapshots and ${deletedOrders.count} order snapshots older than 48h`
      );
    }
  } catch (error) {
    console.error("[SNAPSHOT PRUNE] Error pruning old snapshots:", error);
  }
}

export function startSnapshotService() {
  console.log("[SNAPSHOT] Starting snapshot service...");
  saveSnapshot(); // Save immediately on startup
  snapshotTimer = setInterval(saveSnapshot, SNAPSHOT_INTERVAL);
  pruneOldSnapshots();
  pruneTimer = setInterval(pruneOldSnapshots, PRUNE_INTERVAL);
  console.log(`[SNAPSHOT] Service started (interval: ${SNAPSHOT_INTERVAL}ms, prune: 48h)`);
}

export function stopSnapshotService() {
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
  console.log("[SNAPSHOT] Service stopped");
}

