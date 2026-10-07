# Tradr Project: Startup & Testing Guide

This guide provides step-by-step instructions on how to start the Tradr project (TypeScript services + Python ML layer) and how to test it.

## Prerequisites

Before starting, ensure you have the following installed on your machine:
1. **Docker & Docker Compose** (for running the database, Redis, and Kafka)
2. **Node.js & npm** (or Bun if you prefer, but npm works fine)
3. **Python 3.11+ & uv** (for the Machine Learning workspace)

---

## 1. Starting the Infrastructure (Database, Redis, Kafka)

The project relies on a local PostgreSQL + TimescaleDB database, Redis (for Pub/Sub), and Kafka (for data streaming).

1. Open your terminal at the root of the project (`C:\tradr`).
2. Start the Docker containers in the background:
   ```powershell
   docker-compose up -d
   ```
3. Wait a few seconds for the database and Kafka to initialize.

---

## 2. Setting up the Databases

Because the project isolates the core trading data from the ML data, there are two separate database schemas to initialize: the Prisma (TypeScript) schema and the Alembic (Python ML) schema.

### A. The Prisma Schema (Core Trading)
Run the following from the project root to create the `Trade` tables in the `public` schema. *(We explicitly use Prisma 6 to avoid v8 breaking changes, and skip client generation to avoid needing full node_modules)*:
```powershell
npx prisma@6.17.1 db push --skip-generate --schema packages/database/prisma/schema.prisma
```

### B. The Alembic Schema (Machine Learning)
Run the following to create the `ml` schema, user roles, and the feature tables:
```powershell
cd apps/ml
uv run alembic upgrade head
cd ../..
```

---

## 3. Starting the Application Services

You can start the core TypeScript services (Backend, Frontend, Websocket, and Price Poller) using the Turborepo dev script.

1. Install the Node dependencies (if you haven't already):
   ```powershell
   npm install
   # Or 'bun install' if you have Bun
   ```
2. Start the development servers:
   ```powershell
   npm run dev
   # Or 'bun run dev'
   ```
   *This will concurrently start the backend API, the React frontend, the websocket service, and the Binance price poller.*

---

## 4. Testing the Data Ingestion (Python ML)

To test the Python Machine Learning pipeline, you can run the CLI tool to ingest historical Binance data into your TimescaleDB instance. 

Open a **new terminal window**, navigate to the project root, and run:
```powershell
cd apps/ml
uv run tradr-ml ingest binance --symbols BTC --from 2025-07-01 --to 2025-07-02
```
*You should see a progress bar as it downloads the zip file from Binance, parses the CSV, normalizes the timestamps to microseconds, and batch-inserts the data into the database.*

---

## 5. Running Automated Tests

The project is split into two testing domains:

### TypeScript Tests (Financial Math & Trading Logic)
To run the tests for the core trading engine, liquidations, and PnL math:
```powershell
npm run test
# Or 'bun test apps/ packages/'
```

### Python ML Tests (Feature Integrity & Parity)
*(Once the ML tests are fully written in Milestone 05)*
To run the strict no-lookahead and parity tests for the ML feature engineering:
```powershell
cd apps/ml
uv run pytest
```

---

## Troubleshooting

- **"NoSuchTableError" / "relation does not exist"**: You missed Step 2A. Ensure you pushed the Prisma schema to the database.
- **"Connection Refused" to 5432 or 6379**: Docker isn't running. Ensure you ran `docker-compose up -d`.
- **NPM "workspace:*" Errors**: If `npm install` complains about unsupported `workspace:*` protocols, it is recommended to install [Bun](https://bun.sh/) for Windows, or stick to `npx` commands that bypass full module installations for quick testing.
