import { prisma } from '../config/prisma.js';

export class OverdueService {
  /**
   * Evaluates all active and due today leases against current time.
   * Updates overdue status, creates non-duplicate alerts, and computes overdue hours.
   */
  static async checkAndProcessOverdueLeases() {
    const now = new Date();
    const currentDateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // Fetch active or due today leases
    const candidateLeases = await prisma.lease.findMany({
      where: {
        status: { in: ['Active', 'Due Today', 'Overdue'] },
      },
      include: {
        person: true,
        gun: true,
        alerts: {
          where: {
            type: 'OVERDUE_RETURN',
            status: 'OPEN',
          },
        },
      },
    });

    let updatedCount = 0;
    let newAlertsCount = 0;

    for (const lease of candidateLeases) {
      // Parse expected return date and time
      // Expected format: expectedReturnDate: "2024-10-24", expectedReturnTime: "18:00 PM" or "18:00"
      const isPastDue = this.isLeasePastDue(lease.expectedReturnDate, lease.expectedReturnTime, now);

      if (isPastDue) {
        const hoursOverdue = this.calculateHoursOverdue(lease.expectedReturnDate, lease.expectedReturnTime, now);

        // Update lease status to Overdue if not already marked
        if (lease.status !== 'Overdue' || lease.overdueDurationHours !== hoursOverdue) {
          await prisma.lease.update({
            where: { id: lease.id },
            data: {
              status: 'Overdue',
              overdueDurationHours: hoursOverdue,
            },
          });
          updatedCount++;
        }

        // Check if an open OVERDUE_RETURN alert already exists
        const hasOpenAlert = lease.alerts && lease.alerts.length > 0;
        if (!hasOpenAlert) {
          const notificationsPayload = JSON.stringify({
            person: true,
            supervisingOfficer: true,
            administrator: true,
            lastNotified: now.toISOString(),
          });

          await prisma.alert.create({
            data: {
              leaseId: lease.id,
              gunId: lease.gunId,
              type: 'OVERDUE_RETURN',
              severity: hoursOverdue > 24 ? 'CRITICAL' : 'HIGH',
              status: 'OPEN',
              message: `Overdue Firearm Alert: Officer ${lease.person.fullName} (${lease.person.employeeId}) has not returned ${lease.gun.model} (SN: ${lease.gun.serialNumber}). Expected return was ${lease.expectedReturnDate} ${lease.expectedReturnTime} (${hoursOverdue}h overdue).`,
              notificationsSentJson: notificationsPayload,
            },
          });
          newAlertsCount++;
        }
      } else if (lease.expectedReturnDate === currentDateStr && lease.status === 'Active') {
        // Mark as Due Today
        await prisma.lease.update({
          where: { id: lease.id },
          data: { status: 'Due Today' },
        });
      }
    }

    return { updatedCount, newAlertsCount, checkedCount: candidateLeases.length };
  }

  static isLeasePastDue(expectedDate: string, expectedTime: string, now: Date): boolean {
    try {
      const parsedTime = this.parseTime(expectedTime);
      const expectedDateTime = new Date(`${expectedDate}T${parsedTime}`);
      return now > expectedDateTime;
    } catch {
      // Fallback simple date comparison
      const todayStr = now.toISOString().split('T')[0];
      return expectedDate < todayStr;
    }
  }

  static calculateHoursOverdue(expectedDate: string, expectedTime: string, now: Date): number {
    try {
      const parsedTime = this.parseTime(expectedTime);
      const expectedDateTime = new Date(`${expectedDate}T${parsedTime}`);
      const diffMs = now.getTime() - expectedDateTime.getTime();
      return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));
    } catch {
      return 1;
    }
  }

  static parseTime(timeStr: string): string {
    if (!timeStr) return '18:00:00';
    const clean = timeStr.trim().toUpperCase();
    const isPM = clean.includes('PM');
    const isAM = clean.includes('AM');
    const parts = clean.replace(/(AM|PM)/g, '').trim().split(':');
    let hours = parseInt(parts[0], 10) || 0;
    const minutes = parts[1] ? parseInt(parts[1], 10) : 0;

    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(hours)}:${pad(minutes)}:00`;
  }
}
