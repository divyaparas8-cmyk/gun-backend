import cron from 'node-cron';
import { OverdueService } from '../services/overdueService.js';

export const startOverdueCron = () => {
  // Run every 5 minutes: */5 * * * *
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await OverdueService.checkAndProcessOverdueLeases();
      if (result.updatedCount > 0 || result.newAlertsCount > 0) {
        console.log(
          `[CRON] Overdue Lease Check: Evaluated ${result.checkedCount} records | Updated ${result.updatedCount} leases | Created ${result.newAlertsCount} alerts`
        );
      }
    } catch (error) {
      console.error('[CRON ERROR] Failed during overdue check:', error);
    }
  });

  console.log('[CRON] Automated Overdue Lease Scheduler initialized (Interval: Every 5 minutes)');
};
