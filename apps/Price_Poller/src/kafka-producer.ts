import { Kafka, logLevel } from "kafkajs";
import { binanceEmitter } from "./binance";
import type { Trades } from "./binance";

// Note: KafkaJS timeout warning suppression is handled in index.ts before imports

interface typeofPriceData {
  symbol: string;
  price: number;
  tradeId: number;
  timestamp: number;
  quantity: string;
  isBuyerMaker: boolean;
}

// connecting with Docker / Kafka brokers
const kafka = new Kafka({
  clientId: "tradr_producer",
  brokers: process.env.KAFKA_BROKERS?.split(",") || ["localhost:9092"],
  logLevel: logLevel.NOTHING, // Suppress all Kafka logs - errors handled in catch blocks
  connectionTimeout: 10000, // 10 seconds
  requestTimeout: 30000, // 30 seconds
  retry: {
    initialRetryTime: 300,
    retries: 10,
    maxRetryTime: 30000,
    multiplier: 2,
    restartOnFailure: async (e: any) => {
      // Only restart on network errors, not on fatal errors
      return e.retriable === true;
    },
  },
});

// Configure producer with explicit acks and timeout
const producer = kafka.producer({
  allowAutoTopicCreation: true,
  transactionTimeout: 30000, // 30 seconds
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
});

let tradeListener: ((tradeData: Trades) => Promise<void>) | null = null;
let isShuttingDown = false;
let isConnected = false;

export async function kafkaproduce() {
  if (isShuttingDown || isConnected) return;

  // Wait for Kafka to be ready (5 second delay on first start)
  await new Promise((resolve) => setTimeout(resolve, 5000));

  try {
    console.log("Connecting to Kafka producer...");
    await producer.connect();
    isConnected = true;
    console.log("✓ Kafka Producer connected successfully");

    tradeListener = async (tradeData: Trades) => {
      if (isShuttingDown || !isConnected) return;

      try {
        const publishTrade: typeofPriceData = {
          symbol: tradeData.symbol,
          price: tradeData.price,
          tradeId: tradeData.tradeId,
          timestamp: tradeData.timestamp,
          quantity: tradeData.quantity,
          isBuyerMaker: tradeData.isBuyerMaker,
        };

        await producer.send({
          topic: process.env.KAFKA_TOPIC || "trades",
          timeout: 30000,
          acks: 1,
          compression: 1, // GZIP compression
          messages: [
            {
              key: tradeData.symbol,
              value: JSON.stringify(publishTrade),
              timestamp: String(Date.now()),
            },
          ],
        });
      } catch (error) {
        if (error instanceof Error && !error.message.includes("retriable")) {
          console.error("Error processing kafka trade data:", error.message);
        }
      }
    };

    binanceEmitter.on("trade", tradeListener);
  } catch (err) {
    isConnected = false;
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`✗ Kafka producer connection failed: ${errorMessage}`);
    console.log("Retrying in 5 seconds...");

    if (tradeListener) {
      binanceEmitter.removeListener("trade", tradeListener);
      tradeListener = null;
    }

    if (!isShuttingDown) {
      setTimeout(() => {
        kafkaproduce();
      }, 5000);
    }
  }
}

export async function shutdownProducer() {
  if (isShuttingDown) return;

  isShuttingDown = true;
  console.log("Shutting down Kafka producer...");

  try {
    if (tradeListener) {
      binanceEmitter.removeListener("trade", tradeListener);
      tradeListener = null;
    }

    if (isConnected) {
      await producer.disconnect();
      isConnected = false;
      console.log("✓ Kafka producer disconnected successfully");
    }
  } catch (error) {
    console.error("✗ Error during Kafka producer shutdown:", error);
  }
}
