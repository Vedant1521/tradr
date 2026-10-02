import { Kafka, logLevel } from "kafkajs";
import { writeBatch } from "./database";
import type { Trades } from "./binance";

// State variables
let batch: Trades[] = [];
let batchTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;
let isConnected = false;

// ─── Pipeline watchdog ───────────────────────────────────────────────────────
// Live prices flowing to Redis while the Kafka→Postgres path is dead (chart history
// stops updating) must NEVER happen silently.
// If no successful DB write happens for WATCHDOG_LIMIT_MS, we exit(1) and let
// Docker's `restart: unless-stopped` bring the whole pipeline back up clean.
const WATCHDOG_LIMIT_MS = 3 * 60 * 1000; // 3 minutes
let lastDbWriteOk = Date.now(); // grace period from startup
let watchdogStarted = false;

function startPipelineWatchdog() {
  if (watchdogStarted) return;
  watchdogStarted = true;
  setInterval(() => {
    if (isShuttingDown) return;
    const silentFor = Date.now() - lastDbWriteOk;
    if (silentFor > WATCHDOG_LIMIT_MS) {
      console.error(
        `[WATCHDOG] No successful DB write for ${Math.round(silentFor / 1000)}s - pipeline is dead. Exiting so Docker restarts the service.`
      );
      process.exit(1);
    }
  }, 30_000);
}

const kafka = new Kafka({
  clientId: "tradr_consumer",
  brokers: process.env.KAFKA_BROKERS?.split(",") || ["localhost:9092"],
  logLevel: logLevel.NOTHING,
  connectionTimeout: 10000,
  requestTimeout: 30000,
  retry: {
    initialRetryTime: 300,
    retries: 10,
    maxRetryTime: 30000,
    multiplier: 2,
    restartOnFailure: async (e: any) => {
      return e.retriable === true;
    },
  },
});

const consumer = kafka.consumer({
  groupId: process.env.KAFKA_GROUP_ID || "tradr_consumer_group",
  sessionTimeout: 60000,
  heartbeatInterval: 3000,
  maxWaitTimeInMs: 5000,
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
});

consumer.on(consumer.events.CRASH, (event: any) => {
  if (isShuttingDown) return;
  const willRestart = event?.payload?.restart === true;
  if (!willRestart) {
    console.error(
      "[KAFKA] Consumer crashed with non-retriable error - exiting so Docker restarts the service:",
      event?.payload?.error?.message ?? event
    );
    process.exit(1);
  }
});

async function flushBatch() {
  if (batch.length === 0) return;
  const currentBatch = [...batch];
  batch = [];

  try {
    await writeBatch(currentBatch);
    lastDbWriteOk = Date.now(); // feed watchdog
    console.log(`Flushed ${currentBatch.length} trades to database`);
  } catch (error) {
    console.error("Database write failed:", error);
  }
}

function resetBatchTimer() {
  if (batchTimer) {
    clearTimeout(batchTimer);
  }

  batchTimer = setTimeout(async () => {
    console.log("Batch timeout 5 sec, flushing...");
    await flushBatch();
  }, 5000);
}

export async function consumer_gr() {
  if (isShuttingDown || isConnected) return;

  await new Promise((resolve) => setTimeout(resolve, 6000));
  startPipelineWatchdog();

  try {
    console.log("Connecting to Kafka consumer...");
    await consumer.connect();
    isConnected = true;
    console.log("✓ Kafka Consumer connected successfully");

    const kafkaTopic = process.env.KAFKA_TOPIC || "trades";
    await consumer.subscribe({
      topic: kafkaTopic,
      fromBeginning: false,
    });
    console.log(`Subscribed to '${kafkaTopic}' topic`);

    await consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const data: Trades = JSON.parse(message.value?.toString() ?? "{}");
          batch.push(data);

          if (batch.length >= 500) {
            console.log(`Batch size reached (${batch.length}), flushing...`);
            await flushBatch();

            if (batchTimer) {
              clearTimeout(batchTimer);
            }
            resetBatchTimer();
          } else {
            resetBatchTimer();
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error processing message: ${errorMessage}`);
        }
      },
    });
  } catch (err) {
    isConnected = false;
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`✗ Kafka consumer connection failed: ${errorMessage}`);
    console.log("Retrying in 5 seconds...");

    try {
      if (consumer) {
        await consumer.disconnect();
      }
    } catch (disconnectErr) {
      // Ignore disconnect errors during retry
    }

    if (!isShuttingDown) {
      setTimeout(() => {
        consumer_gr();
      }, 5000);
    }
  }
}

export async function shutdownConsumer() {
  if (isShuttingDown) return;

  isShuttingDown = true;
  console.log("Shutting down Kafka consumer...");

  try {
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
      console.log("✓ Batch timer stopped");
    }

    if (batch.length > 0) {
      console.log(`Flushing ${batch.length} remaining trades to database...`);
      await writeBatch(batch);
      batch = [];
      console.log("✓ Batch flushed successfully");
    }

    if (isConnected && consumer) {
      await consumer.disconnect();
      isConnected = false;
      console.log("✓ Kafka consumer disconnected successfully");
    }
  } catch (error) {
    console.error("✗ Error during Kafka consumer shutdown:", error);
  }
}
