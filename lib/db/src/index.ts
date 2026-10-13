import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Sensible connection pool configuration options with fallback defaults
const poolMax = process.env.DATABASE_POOL_MAX ? parseInt(process.env.DATABASE_POOL_MAX, 10) : 30;
const poolMin = process.env.DATABASE_POOL_MIN ? parseInt(process.env.DATABASE_POOL_MIN, 10) : 5;
const idleTimeout = process.env.DATABASE_IDLE_TIMEOUT ? parseInt(process.env.DATABASE_IDLE_TIMEOUT, 10) : 30000;
const connectionTimeout = process.env.DATABASE_CONN_TIMEOUT ? parseInt(process.env.DATABASE_CONN_TIMEOUT, 10) : 2000;

// Primary database connection pool for write operations (INSERT, UPDATE, DELETE)
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: poolMax,
  idleTimeoutMillis: idleTimeout,
  connectionTimeoutMillis: connectionTimeout,
});

pool.on("connect", () => {
  console.log(`[Primary DB Pool] Client connected. Total: ${pool.totalCount}, Idle: ${pool.idleCount}, Waiting: ${pool.waitingCount}`);
});

pool.on("acquire", () => {
  if (pool.waitingCount > 0) {
    console.warn(`[Primary DB Pool WARN] Clients are waiting for a connection! Waiting: ${pool.waitingCount}`);
  }
});

pool.on("remove", () => {
  console.log(`[Primary DB Pool] Client removed from pool. Total: ${pool.totalCount}`);
});

pool.on("error", (err) => {
  console.error("[Primary DB Pool] Unexpected error on idle client:", err);
});

export const db = drizzle(pool, { schema });

// Replica database connection pool for read operations (SELECT, exports, rankings, dashboards)
const replicaUrl = process.env.REPLICA_DATABASE_URL || process.env.DATABASE_URL;
export const readPool = new Pool({
  connectionString: replicaUrl,
  max: poolMax,
  idleTimeoutMillis: idleTimeout,
  connectionTimeoutMillis: connectionTimeout,
});

readPool.on("connect", () => {
  console.log(`[Replica DB Pool] Client connected. Total: ${readPool.totalCount}, Idle: ${readPool.idleCount}, Waiting: ${readPool.waitingCount}`);
});

readPool.on("acquire", () => {
  if (readPool.waitingCount > 0) {
    console.warn(`[Replica DB Pool WARN] Clients are waiting for a connection! Waiting: ${readPool.waitingCount}`);
  }
});

readPool.on("remove", () => {
  console.log(`[Replica DB Pool] Client removed from pool. Total: ${readPool.totalCount}`);
});

readPool.on("error", (err) => {
  console.error("[Replica DB Pool] Unexpected error on idle client:", err);
});

export const readDb = drizzle(readPool, { schema });

// Helper function to pre-warm pool connections
async function warmPool(p: pg.Pool, min: number, name: string) {
  const clients: pg.PoolClient[] = [];
  try {
    for (let i = 0; i < min; i++) {
      clients.push(await p.connect());
    }
    console.log(`[DB Pool Pre-warm] ${name} pool pre-warmed with ${clients.length} connections.`);
  } catch (err) {
    console.error(`[DB Pool Pre-warm Error] ${name} pool failed to pre-warm:`, err);
  } finally {
    for (const client of clients) {
      client.release();
    }
  }
}

// Warm pools in background on import
warmPool(pool, poolMin, "Primary").catch(() => {});
warmPool(readPool, poolMin, "Replica").catch(() => {});

// Get metrics for health checks
export function getPoolMetrics() {
  const getStats = (p: pg.Pool) => {
    const total = p.totalCount;
    const idle = p.idleCount;
    const waiting = p.waitingCount;
    const max = (p as any).options?.max || 30;
    const utilization = total > 0 ? `${Math.round(((total - idle) / max) * 100)}%` : "0%";
    return { total, idle, waiting, utilization };
  };
  return {
    primary: getStats(pool),
    replica: getStats(readPool),
  };
}

export * from "./schema";

