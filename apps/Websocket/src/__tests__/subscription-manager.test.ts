import { describe, expect, it, mock } from "bun:test";
import { SubscriptionManager } from "../subscription-manager";
import type { ServerMessage } from "../types";
import type { WebSocket } from "ws";

function createMockSocket(): WebSocket & { sentMessages: string[] } {
  const sentMessages: string[] = [];
  return {
    send: (msg: string) => {
      sentMessages.push(msg);
    },
    readyState: 1, // WebSocket.OPEN
    sentMessages,
  } as unknown as WebSocket & { sentMessages: string[] };
}

describe("WebSocket SubscriptionManager", () => {
  it("should add clients with unique IDs and empty initial subscriptions", () => {
    const manager = new SubscriptionManager();
    const ws1 = createMockSocket();
    const ws2 = createMockSocket();

    manager.addClient(ws1);
    manager.addClient(ws2);

    expect(manager.clients.size).toBe(2);
    const info1 = manager.clients.get(ws1);
    const info2 = manager.clients.get(ws2);

    expect(info1).toBeDefined();
    expect(info2).toBeDefined();
    expect(info1!.id).not.toBe(info2!.id);
    expect(info1!.subscriptions.size).toBe(0);
  });

  it("should subscribe client to supported assets and prevent duplicates", () => {
    const manager = new SubscriptionManager();
    const ws = createMockSocket();
    manager.addClient(ws);

    manager.subscribeClient(ws, "BTC");
    const info = manager.clients.get(ws);
    expect(info!.subscriptions.has("BTC")).toBe(true);

    // Duplicate subscription should be a no-op
    manager.subscribeClient(ws, "BTC");
    expect(info!.subscriptions.size).toBe(1);

    // Subscribe to second asset
    manager.subscribeClient(ws, "ETH");
    expect(info!.subscriptions.size).toBe(2);
    expect(info!.subscriptions.has("ETH")).toBe(true);
  });

  it("should ignore unsupported assets", () => {
    const manager = new SubscriptionManager();
    const ws = createMockSocket();
    manager.addClient(ws);

    // @ts-expect-error testing invalid asset
    manager.subscribeClient(ws, "DOGECOIN");
    const info = manager.clients.get(ws);
    expect(info!.subscriptions.size).toBe(0);
  });

  it("should unsubscribe clients cleanly from specific assets", () => {
    const manager = new SubscriptionManager();
    const ws = createMockSocket();
    manager.addClient(ws);

    manager.subscribeClient(ws, "BTC");
    manager.subscribeClient(ws, "SOL");
    expect(manager.clients.get(ws)!.subscriptions.size).toBe(2);

    manager.unsubscribeClient(ws, "BTC");
    expect(manager.clients.get(ws)!.subscriptions.has("BTC")).toBe(false);
    expect(manager.clients.get(ws)!.subscriptions.has("SOL")).toBe(true);
    expect(manager.assetSubscribers.get("BTC")).toBeUndefined();
  });

  it("should clean up all subscriber entries on client disconnect", () => {
    const manager = new SubscriptionManager();
    const ws = createMockSocket();
    manager.addClient(ws);
    manager.subscribeClient(ws, "BTC");
    manager.subscribeClient(ws, "ETH");

    manager.removeClient(ws);

    expect(manager.clients.has(ws)).toBe(false);
    expect(manager.assetSubscribers.get("BTC")).toBeUndefined();
    expect(manager.assetSubscribers.get("ETH")).toBeUndefined();
  });

  it("should assign authenticated userId to client", () => {
    const manager = new SubscriptionManager();
    const ws = createMockSocket();
    manager.addClient(ws);

    manager.setUserId(ws, "user_12345");
    expect(manager.clients.get(ws)!.userId).toBe("user_12345");
  });

  it("should route broadcast messages strictly to subscribed clients", () => {
    const manager = new SubscriptionManager();
    const aliceWs = createMockSocket();
    const bobWs = createMockSocket();

    manager.addClient(aliceWs);
    manager.addClient(bobWs);

    // Alice subscribes to BTC; Bob subscribes to ETH
    manager.subscribeClient(aliceWs, "BTC");
    manager.subscribeClient(bobWs, "ETH");

    const btcMessage: ServerMessage = {
      type: "PRICE_UPDATE",
      data: {
        symbol: "BTC",
        bidPrice: 600000000,
        askPrice: 600600000,
        decimals: 4,
        time: 1700000000,
      },
    };

    manager.broadcast("BTC", btcMessage);

    // Alice received the BTC price update
    expect(aliceWs.sentMessages.length).toBe(1);
    expect(JSON.parse(aliceWs.sentMessages[0]!)).toEqual(btcMessage);

    // Bob received NOTHING
    expect(bobWs.sentMessages.length).toBe(0);
  });
});
