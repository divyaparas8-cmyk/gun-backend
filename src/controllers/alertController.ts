import { Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { logAudit } from '../services/auditService.js';

export class AlertController {
  static async listAlerts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { status, type } = req.query;

      const where: any = {};
      if (status && typeof status === 'string' && status !== 'All') {
        where.status = status;
      }
      if (type && typeof type === 'string' && type !== 'All') {
        where.type = type;
      }

      const alerts = await prisma.alert.findMany({
        where,
        include: {
          lease: {
            include: {
              person: true,
              gun: true,
            },
          },
          gun: true,
          ammunition: true,
          accessory: true,
          remarks: {
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Format alerts
      const formatted = alerts.map((a) => {
        const lease = a.lease;
        return {
          id: a.id,
          leaseId: a.leaseId || undefined,
          personName: lease?.person?.fullName || 'N/A',
          employeeId: lease?.person?.employeeId || 'N/A',
          phone: lease?.person?.phone || 'N/A',
          gunModel: lease?.gun ? `${lease.gun.model} (SN-${lease.gun.serialNumber})` : a.gun?.model || 'N/A',
          gunId: a.gunId || lease?.gunId || 'N/A',
          gunSerial: a.gun?.serialNumber || lease?.gun?.serialNumber,
          expectedReturn: lease ? `${lease.expectedReturnDate} ${lease.expectedReturnTime}` : 'N/A',
          overdueDuration: lease ? `${lease.overdueDurationHours || 0} hours overdue` : 'N/A',
          supervisingOfficer: lease?.person?.supervisingOfficer || 'N/A',
          type: a.type,
          severity: a.severity,
          status: a.status,
          message: a.message,
          notificationsSent: a.notificationsSentJson
            ? JSON.parse(a.notificationsSentJson)
            : { person: true, supervisingOfficer: true, administrator: true, lastNotified: a.createdAt.toISOString() },
          followUpRemarks: a.remarks.map((r) => ({
            date: r.createdAt.toISOString().replace('T', ' ').substring(0, 16),
            officer: r.officer,
            remark: r.remark,
          })),
          createdAt: a.createdAt,
          resolvedAt: a.resolvedAt,
          resolvedBy: a.resolvedBy,
        };
      });

      res.status(200).json({
        success: true,
        data: formatted,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getAlert(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const alert = await prisma.alert.findUnique({
        where: { id },
        include: {
          lease: {
            include: {
              person: true,
              gun: true,
            },
          },
          gun: true,
          ammunition: true,
          accessory: true,
          remarks: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!alert) {
        throw new AppError('Alert not found.', 404, 'ALERT_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        data: alert,
      });
    } catch (error) {
      next(error);
    }
  }

  static async addRemark(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const { remark } = req.body;

      if (!remark || remark.trim() === '') {
        throw new AppError('Remark text is required.', 400, 'MISSING_REMARK');
      }

      const alert = await prisma.alert.findUnique({ where: { id } });
      if (!alert) {
        throw new AppError('Alert not found.', 404, 'ALERT_NOT_FOUND');
      }

      const officerName = req.user?.name || 'Supervisor / Officer';

      const newRemark = await prisma.alertRemark.create({
        data: {
          alertId: alert.id,
          leaseId: alert.leaseId || null,
          officer: officerName,
          remark: remark.trim(),
          userId: req.user?.id || null,
        },
      });

      await logAudit({
        req,
        action: 'ADD_ALERT_REMARK',
        entityType: 'Alert',
        entityId: id,
        newValue: { remark: newRemark.remark, officer: officerName },
      });

      res.status(201).json({
        success: true,
        message: 'Follow-up remark recorded.',
        data: {
          id: newRemark.id,
          date: newRemark.createdAt.toISOString().replace('T', ' ').substring(0, 16),
          officer: newRemark.officer,
          remark: newRemark.remark,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async resolveAlert(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const officerName = req.user?.name || 'Authorized Officer';

      const alert = await prisma.alert.findUnique({ where: { id } });
      if (!alert) {
        throw new AppError('Alert not found.', 404, 'ALERT_NOT_FOUND');
      }

      const updated = await prisma.alert.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolvedBy: officerName,
        },
      });

      await logAudit({
        req,
        action: 'RESOLVE_ALERT',
        entityType: 'Alert',
        entityId: id,
        newValue: { status: 'RESOLVED', resolvedBy: officerName },
      });

      res.status(200).json({
        success: true,
        message: 'Alert marked as resolved.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
}
