import { BINANCE_STREAMS, toInternalPrice } from "shared";
import { WebSocket } from "ws";
import { EventEmitter } from "events"; // built-in EventEmitter to distribute trades across modules

export interface Trades {
  tradeId: number;
  symbol: string;
  price: number;
  quantity: string;
  timestamp: number;
  isBuyerMaker: boolean; // Captured for order-flow & taker/maker imbalance analytics
}

// Export the event emitter so other modules can listen
export const binanceEmitter = new EventEmitter();
let wss: WebSocket | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;
let isShuttingDown = false;

export function startBinance() {
  if (isShuttingDown) return;
  try {
    wss = new WebSocket("wss://stream.binance.com:9443/ws"); // connecting to Binance
    // On opening WebSocket
    wss.on("open", () => {
      console.log("Binance WebSocket is Connected");
      // Subscription message to get aggTrade streams from Binance
      const stream = {
        method: "SUBSCRIBE",
        params: Object.values(BINANCE_STREAMS),
        id: 1,
      };
      // Send subscription
      wss?.send(JSON.stringify(stream));
    });

    // Data coming from Binance
    wss.on("message", (data: Buffer) => {
      try {
        const message_ws = JSON.parse(data.toString());
        if (message_ws.e === "aggTrade") {
          const liveTrades: Trades = {
            tradeId: message_ws.a,
            symbol: message_ws.s,
            price: toInternalPrice(message_ws.p),
            quantity: message_ws.q,
            timestamp: message_ws.T,
            isBuyerMaker: Boolean(message_ws.m), // 'm' is true if the buyer is the market maker
          };
          // Emit the trade data
          binanceEmitter.emit("trade", liveTrades);
        }
      } catch (err) {
        console.error("Error in Emitting data in Binance websocket", err);
      }
    });

    // On WebSocket closing
    wss.on("close", () => {
      if (isShuttingDown) return;
      console.log("Websocket connection is closed");
      // Reconnect after 3 seconds
      reconnectTimeout = setTimeout(() => {
        console.log("Attempting to reconnect...");
        startBinance();
      }, 3000);
    });

    wss.on("error", (err) => {
      console.error("WebSocket error:", err);
      wss?.close();
    });
  } catch (err) {
    console.error("Fatal error in startBinance websocket:", err);
    if (!isShuttingDown) {
      reconnectTimeout = setTimeout(() => {
        console.log("Attempting to reconnect...");
        startBinance();
      }, 3000);
    }
  }
}

async function gracefulShutdown(signal: string) {
  isShuttingDown = true;
  console.log(`${signal} received: Shutting down Binance WebSocket...`);

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (wss) {
    wss.close();
    wss = null;
  }

  console.log("Binance WebSocket stopped");
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
