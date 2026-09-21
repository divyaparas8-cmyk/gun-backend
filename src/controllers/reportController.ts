import { Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';

export class ReportController {
  static async getAvailableGuns(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { gunType, location } = req.query;
      const where: any = { status: 'Available' };
      if (gunType && typeof gunType === 'string' && gunType !== 'All') where.gunType = gunType;
      if (location && typeof location === 'string' && location !== 'All') where.location = location;

      const guns = await prisma.gun.findMany({
        where,
        orderBy: { model: 'asc' },
      });

      res.status(200).json({ success: true, data: guns, count: guns.length });
    } catch (error) {
      next(error);
    }
  }

  static async getLeasedGuns(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { department } = req.query;
      const where: any = { status: { in: ['Active', 'Due Today', 'Overdue'] } };
      if (department && typeof department === 'string' && department !== 'All') {
        where.person = { department };
      }

      const leases = await prisma.lease.findMany({
        where,
        include: { person: true, gun: true, pistol: true },
        orderBy: { issueDate: 'desc' },
      });

      res.status(200).json({ success: true, data: leases, count: leases.length });
    } catch (error) {
      next(error);
    }
  }

  static async getOverdueReturns(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const leases = await prisma.lease.findMany({
        where: { status: 'Overdue' },
        include: {
          person: true,
          gun: true,
          remarks: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { overdueDurationHours: 'desc' },
      });

      res.status(200).json({ success: true, data: leases, count: leases.length });
    } catch (error) {
      next(error);
    }
  }

  static async getLeaseHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { dateFrom, dateTo, department, status } = req.query;
      const where: any = {};

      if (status && typeof status === 'string' && status !== 'All') where.status = status;
      if (department && typeof department === 'string' && department !== 'All') where.person = { department };
      if (dateFrom || dateTo) {
        where.issueDate = {};
        if (dateFrom) where.issueDate.gte = String(dateFrom);
        if (dateTo) where.issueDate.lte = String(dateTo);
      }

      const history = await prisma.lease.findMany({
        where,
        include: { person: true, gun: true, returnRecord: true },
        orderBy: { issueDate: 'desc' },
      });

      res.status(200).json({ success: true, data: history, count: history.length });
    } catch (error) {
      next(error);
    }
  }

  static async getPersonGunHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { personId } = req.query;
      const where: any = personId ? { personId: String(personId) } : {};

      const history = await prisma.lease.findMany({
        where,
        include: { person: true, gun: true, returnRecord: true },
        orderBy: { issueDate: 'desc' },
      });

      res.status(200).json({ success: true, data: history, count: history.length });
    } catch (error) {
      next(error);
    }
  }

  static async getDepartmentGuns(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const departments = await prisma.person.groupBy({
        by: ['department'],
        _count: { id: true },
      });

      const result = await Promise.all(
        departments.map(async (dept: { department: string; _count: { id: number } }) => {
          const activeLeasesCount = await prisma.lease.count({
            where: {
              person: { department: dept.department },
              status: { in: ['Active', 'Due Today', 'Overdue'] },
            },
          });
          const totalPersonnel = (dept as any)._count?.id ?? (dept as any)._count?._all ?? 0;
          return {
            department: dept.department,
            totalPersonnel,
            activeFirearmsInCustody: activeLeasesCount,
          };
        })
      );

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async getAmmunitionStock(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const stock = await prisma.ammunition.findMany({
        orderBy: { bulletType: 'asc' },
      });
      res.status(200).json({ success: true, data: stock });
    } catch (error) {
      next(error);
    }
  }

  static async getAmmunitionUsage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const transactions = await prisma.ammunitionTransaction.findMany({
        include: { ammunition: true },
        orderBy: { date: 'desc' },
        take: 100,
      });

      res.status(200).json({ success: true, data: transactions });
    } catch (error) {
      next(error);
    }
  }

  static async getMissingDamagedItems(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const [damagedReturns, damagedAlerts, missingGearAlerts] = await Promise.all([
        prisma.gunReturn.findMany({
          where: {
            OR: [
              { gunCondition: 'Damaged' },
              { missingAccessories: { not: null } },
              { damageInformation: { not: null } },
            ],
          },
          include: { lease: { include: { person: true, gun: true } } },
        }),
        prisma.alert.findMany({
          where: { type: 'DAMAGED_GUN' },
          include: { gun: true, lease: { include: { person: true } } },
        }),
        prisma.alert.findMany({
          where: { type: 'MISSING_ACCESSORY' },
          include: { lease: { include: { person: true } } },
        }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          damagedReturns,
          damagedAlerts,
          missingGearAlerts,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
