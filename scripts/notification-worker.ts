/**
 * Swanford Academy — Dedicated Notification Outbox Background Worker Daemon
 * Stage 10: Notifications & Hostinger / Continuous Execution
 *
 * Runs continuously via PM2, systemd, or `npm run worker:notifications`.
 *
 * Guarantees:
 * - Leased workers with version fencing.
 * - Zero DB locks held during SMTP network I/O.
 * - Periodic reaping of crashed / expired worker leases.
 * - Graceful shutdown on SIGINT / SIGTERM.
 */

import { processPendingNotifications, reapStaleNotificationLocks } from '../src/lib/notifications/worker';
import { processDueScheduledReminders } from '../src/lib/finance/reminder_service';

const POLL_INTERVAL_MS = 5000;
let isRunning = true;

async function main() {
  const workerId = `hostinger-worker-${process.pid}`;
  console.log('------------------------------------------------------------');
  console.log('Swanford Academy — Notification Outbox & Reminder Worker Started');
  console.log(`Process PID: ${process.pid} | Worker ID: ${workerId}`);
  console.log('------------------------------------------------------------');

  let loopCount = 0;

  while (isRunning) {
    loopCount++;

    try {
      // Every 12 loops (~1 minute), reap stale notification leases
      if (loopCount % 12 === 0) {
        const reaped = await reapStaleNotificationLocks();
        if (reaped > 0) {
          console.log(`[Reaper] Reclaimed ${reaped} stale notification leases.`);
        }
      }

      // Every 6 loops (~30 seconds), check for and process due scheduled payment reminders
      if (loopCount % 6 === 0) {
        try {
          const processedCount = await processDueScheduledReminders();
          if (processedCount > 0) {
            console.log(
              `[Reminder Worker] Processed ${processedCount} scheduled reminder batch(es).`
            );
          }
        } catch (reminderErr) {
          console.error('[Reminder Worker Error]:', reminderErr);
        }
      }

      const result = await processPendingNotifications({
        batchSize: 20,
        workerId,
      });

      if (result.processedCount > 0) {
        console.log(
          `[Worker] Processed: ${result.processedCount}, Succeeded: ${result.succeededCount}, Failed: ${result.failedCount}, DeadLetter: ${result.deadLetterCount}`
        );
        // If there were jobs processed, immediately loop again to drain queue
        continue;
      }
    } catch (error) {
      console.error('[Worker Loop Error]:', error);
    }

    // Sleep before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.log('Notification Worker stopped gracefully.');
}

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT. Shutting down notification worker...');
  isRunning = false;
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM. Shutting down notification worker...');
  isRunning = false;
});

main().catch((err) => {
  console.error('Fatal Worker Exception:', err);
  process.exit(1);
});
