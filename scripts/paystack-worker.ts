/**
 * Swanford Academy — Dedicated Paystack Background Worker Daemon
 * Master Specification Reference: Sections 6, 7, 15, 24
 *
 * Can be run via PM2, systemd, Docker, or `npm run worker:paystack`.
 */

import { processPendingWebhookEvents, reapStaleLocks } from "../src/lib/paystack";

const POLL_INTERVAL_MS = 5000;
let isRunning = true;

async function main() {
  console.log("------------------------------------------------------------");
  console.log("Swanford Academy — Paystack Durable Queue Worker Started");
  console.log(`Process PID: ${process.pid}`);
  console.log("------------------------------------------------------------");

  let loopCount = 0;

  while (isRunning) {
    loopCount++;

    try {
      // Every 12 loops (~1 minute), reap stale locks
      if (loopCount % 12 === 0) {
        const reaped = await reapStaleLocks(5);
        if (reaped > 0) {
          console.log(`[Reaper] Reclaimed ${reaped} stale worker locks.`);
        }
      }

      const result = await processPendingWebhookEvents(10, `worker-${process.pid}`);
      if (result.claimed > 0) {
        console.log(
          `[Worker] Claimed: ${result.claimed}, Processed: ${result.processed}, Failed: ${result.failed}, Fatal: ${result.fatal}`
        );
        // If there were jobs, immediately check again
        continue;
      }
    } catch (error) {
      console.error("[Worker Loop Error]:", error);
    }

    // Sleep before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.log("Paystack Worker stopped gracefully.");
}

process.on("SIGINT", () => {
  console.log("\nReceived SIGINT. Shutting down worker...");
  isRunning = false;
});

process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM. Shutting down worker...");
  isRunning = false;
});

main().catch((err) => {
  console.error("Fatal Worker Exception:", err);
  process.exit(1);
});
