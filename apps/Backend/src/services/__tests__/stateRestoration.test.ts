import { describe, expect, it, mock, beforeEach } from "bun:test";
import { StoreData, orderStorageMap, emailToUserId } from "../../data/store";
import { restoreState } from "../stateRestoration";
import { prisma } from "database";

describe("State Restoration Service (restoreState)", () => {
  beforeEach(() => {
    StoreData.clear();
    orderStorageMap.clear();
    emailToUserId.clear();
  });

  it("should restore users and active orders into in-memory maps cleanly", async () => {
    // Mock prisma responses
    const mockUsers = [
      {
        userId: "user-1",
        email: "alice@example.com",
        password: "hashedpassword123",
        balanceCents: 750000,
        createdAt: new Date(),
        updatedAt: new Date(),
        provider: null,
        providerId: null,
        emailVerified: true,
        avatarUrl: null,
        verificationCode: null,
        verificationExpiry: null,
      },
    ];

    const mockOrders = [
      {
        orderId: "order-1",
        userId: "user-1",
        asset: "BTC",
        type: "buy",
        margin: 50000,
        initialMargin: 50000,
        addedMargin: 0,
        leverage: 10,
        openPrice: 650000000,
        liquidationPrice: 585000000,
        takeProfit: 700000000,
        stopLoss: 620000000,
        openedAt: new Date(1700000000000),
        createdAt: new Date(),
        updatedAt: new Date(),
        trailingStopLossEnabled: true,
        trailingStopLossDistance: 5000000,
        trailingStopLossHighestPrice: 660000000,
        trailingStopLossLowestPrice: null,
      },
    ];

    // Mock prisma queries
    prisma.user.findMany = mock(() => Promise.resolve(mockUsers as any));
    prisma.activeOrder.findMany = mock(() => Promise.resolve(mockOrders as any));

    await restoreState();

    // Verify user restored in StoreData
    const alice = StoreData.get("user-1");
    expect(alice).toBeDefined();
    expect(alice?.email).toBe("alice@example.com");
    expect(alice?.balance.usd_balance).toBe(750000);

    // Verify emailToUserId mapping
    expect(emailToUserId.get("alice@example.com")).toBe("user-1");

    // Verify order restored in orderStorageMap
    const userOrders = orderStorageMap.get("user-1");
    expect(userOrders).toBeDefined();
    expect(userOrders?.has("order-1")).toBe(true);

    const restoredOrder = userOrders?.get("order-1");
    expect(restoredOrder?.asset).toBe("BTC");
    expect(restoredOrder?.type).toBe("buy");
    expect(restoredOrder?.margin).toBe(50000);
    expect(restoredOrder?.initialMargin).toBe(50000);
    expect(restoredOrder?.leverage).toBe(10);
    expect(restoredOrder?.takeProfit).toBe(700000000);
    expect(restoredOrder?.stopLoss).toBe(620000000);
    expect(restoredOrder?.openTimestamp).toBe(1700000000000);
    expect(restoredOrder?.trailingStopLoss).toEqual({
      enabled: true,
      trailingDistance: 5000000,
      highestPrice: 660000000,
      lowestPrice: undefined,
    });
  });
});
