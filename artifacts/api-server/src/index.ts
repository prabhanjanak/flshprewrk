import "./lib/afm-fonts";
import app from "./app";
import { logger } from "./lib/logger";
import { db, globalSettingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { bootstrapDatabase } from "./lib/db-bootstrap";

const rawPort = process.env["PORT"] || "5001";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "Unhandled Promise Rejection");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught Exception");
});


async function startServer() {
  try {
    // 1. Run complete database bootstrap, rework, schema updates & data healing
    await bootstrapDatabase();

    // 2. Start periodic active session cleanup job
    setInterval(async () => {
      try {
        const [setting] = await db.select().from(globalSettingsTable).where(eq(globalSettingsTable.key, "session_inactivity_timeout"));
        const timeoutMinutes = setting ? parseInt(setting.value, 10) : 30;
        const threshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);
        await db.execute(sql`
          UPDATE user_sessions 
          SET is_active = FALSE 
          WHERE is_active = TRUE AND last_activity_at < ${threshold}
        `);
      } catch (e) {
        logger.error({ err: e }, "Failed to prune inactive sessions");
      }
    }, 5 * 60 * 1000); // run every 5 minutes

    // 3. Start listening for incoming HTTP requests
    const server = app.listen(port, () => {
      logger.info({ port }, "Server listening and ready for requests");
    });

    const gracefulShutdown = (signal: string) => {
      logger.info({ signal }, "Received termination signal, shutting down gracefully...");
      server.close(() => {
        logger.info("HTTP server closed.");
        process.exit(0);
      });
      setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (err: any) {
    logger.error({ err }, "Fatal startup error during database bootstrap");
    process.exit(1);
  }
}

startServer();


