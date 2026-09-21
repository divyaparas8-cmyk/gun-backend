import { Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { logAudit } from '../services/auditService.js';

export class LocationController {
  static async listLocations(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const locations = await prisma.storageLocation.findMany({
        orderBy: { name: 'asc' },
      });
      res.status(200).json({ success: true, data: locations });
    } catch (error) {
      next(error);
    }
  }

  static async createLocation(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { name, nameAr, room, type, description, status } = req.body;
      if (!name) throw new AppError('Storage location name is required.', 400, 'MISSING_NAME');

      const location = await prisma.storageLocation.create({
        data: {
          name,
          nameAr,
          room,
          type: type || 'General',
          description,
          status: status || 'Active',
        },
      });

      await logAudit({
        req,
        action: 'CREATE_LOCATION',
        entityType: 'StorageLocation',
        entityId: location.id,
        newValue: { name: location.name },
      });

      res.status(201).json({ success: true, data: location });
    } catch (error) {
      next(error);
    }
  }
}

export class DepartmentController {
  static async listDepartments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const departments = await prisma.department.findMany({
        orderBy: { name: 'asc' },
      });
      res.status(200).json({ success: true, data: departments });
    } catch (error) {
      next(error);
    }
  }

  static async createDepartment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { name, nameAr, code, description } = req.body;
      if (!name) throw new AppError('Department name is required.', 400, 'MISSING_NAME');

      const department = await prisma.department.create({
        data: { name, nameAr, code, description },
      });

      await logAudit({
        req,
        action: 'CREATE_DEPARTMENT',
        entityType: 'Department',
        entityId: department.id,
        newValue: { name: department.name },
      });

      res.status(201).json({ success: true, data: department });
    } catch (error) {
      next(error);
    }
  }
}

export class AuditController {
  static async listAuditLogs(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { entityType, action, search, page, limit } = req.query;
      const where: any = {};

      if (entityType && typeof entityType === 'string' && entityType !== 'All') {
        where.entityType = entityType;
      }
      if (action && typeof action === 'string' && action !== 'All') {
        where.action = action;
      }
      if (search && typeof search === 'string' && search.trim() !== '') {
        const q = search.trim();
        where.OR = [
          { action: { contains: q } },
          { userEmail: { contains: q } },
          { entityId: { contains: q } },
          { newValue: { contains: q } },
        ];
      }

      const take = limit ? parseInt(limit as string, 10) : 100;
      const skip = page && limit ? (parseInt(page as string, 10) - 1) * take : 0;

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include: { user: true },
          take,
          skip,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: logs,
        meta: {
          total,
          page: page ? parseInt(page as string, 10) : 1,
          limit: take,
          totalPages: Math.ceil(total / take),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export class SettingsController {
  static async listSettings(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const settings = await prisma.systemSetting.findMany({
        orderBy: { key: 'asc' },
      });
      res.status(200).json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  }

  static async updateSetting(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const key = String(req.params.key);
      const { value, description } = req.body;

      const updated = await prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(value), description },
        create: { key, value: String(value), description },
      });

      await logAudit({
        req,
        action: 'SETTINGS_CHANGED',
        entityType: 'Setting',
        entityId: key,
        newValue: { key, value },
      });

      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
}
