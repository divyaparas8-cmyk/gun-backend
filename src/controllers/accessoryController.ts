import { Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { logAudit } from '../services/auditService.js';

export class AccessoryController {
  static async listAccessories(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { category } = req.query;
      const where: any = {};
      if (category && typeof category === 'string' && category !== 'All Categories') {
        where.category = category;
      }

      const items = await prisma.accessory.findMany({
        where,
        orderBy: { name: 'asc' },
      });

      res.status(200).json({
        success: true,
        data: items,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getAccessory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const item = await prisma.accessory.findUnique({
        where: { id },
        include: {
          transactions: {
            orderBy: { date: 'desc' },
            take: 50,
          },
        },
      });

      if (!item) {
        throw new AppError('Accessory item not found.', 404, 'ACCESSORY_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  static async createAccessory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const {
        name,
        nameAr,
        category,
        categoryAr,
        availableQuantity,
        totalQuantity,
        condition,
        storageLocation,
        storageLocationAr,
        assignedPerson,
        notes,
        notesAr,
      } = req.body;

      if (!name || !category || !storageLocation) {
        throw new AppError('Name, category, and storage location are required.', 400, 'MISSING_FIELDS');
      }

      const total = parseInt(totalQuantity || availableQuantity || '0', 10);
      const avail = parseInt(availableQuantity || totalQuantity || '0', 10);

      const accessory = await prisma.accessory.create({
        data: {
          name,
          nameAr,
          category,
          categoryAr,
          availableQuantity: avail,
          totalQuantity: total,
          condition: condition || 'Good',
          storageLocation,
          storageLocationAr,
          assignedPerson,
          notes,
          notesAr,
        },
      });

      if (avail > 0) {
        await prisma.accessoryTransaction.create({
          data: {
            accessoryId: accessory.id,
            type: 'Stock Received',
            quantity: avail,
            reference: 'INITIAL-STOCK-REGISTRY',
            performedBy: req.user?.name || 'Administrator',
            userId: req.user?.id || null,
            notes: 'Initial inventory intake',
          },
        });
      }

      await logAudit({
        req,
        action: 'ACCESSORY_ISSUED',
        entityType: 'Accessory',
        entityId: accessory.id,
        newValue: { name: accessory.name, category: accessory.category, availableQuantity: avail },
      });

      res.status(201).json({
        success: true,
        message: 'Accessory added to registry',
        data: accessory,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateAccessory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const updateData = { ...req.body };

      const existing = await prisma.accessory.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError('Accessory not found.', 404, 'ACCESSORY_NOT_FOUND');
      }

      delete updateData.id;
      delete updateData.createdAt;

      const updated = await prisma.accessory.update({
        where: { id },
        data: updateData,
      });

      await logAudit({
        req,
        action: 'ACCESSORY_ADJUSTED',
        entityType: 'Accessory',
        entityId: id,
        oldValue: existing,
        newValue: updated,
      });

      res.status(200).json({
        success: true,
        message: 'Accessory details updated',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async adjustStock(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const { type, quantity, reference, notes } = req.body;

      const delta = parseInt(quantity, 10);
      if (isNaN(delta) || delta <= 0) {
        throw new AppError('Quantity must be a positive integer.', 400, 'INVALID_QUANTITY');
      }

      const item = await prisma.accessory.findUnique({ where: { id } });
      if (!item) {
        throw new AppError('Accessory not found.', 404, 'ACCESSORY_NOT_FOUND');
      }

      let newAvail = item.availableQuantity;
      let newTotal = item.totalQuantity;

      if (type === 'Stock Received' || type === 'Returned') {
        newAvail += delta;
        if (type === 'Stock Received') newTotal += delta;
      } else {
        if (item.availableQuantity < delta) {
          throw new AppError(
            `Cannot deduct ${delta} items. Available quantity is ${item.availableQuantity}.`,
            400,
            'INSUFFICIENT_STOCK'
          );
        }
        newAvail -= delta;
        if (type === 'Damaged/Lost') newTotal = Math.max(0, newTotal - delta);
      }

      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.accessory.update({
          where: { id },
          data: {
            availableQuantity: newAvail,
            totalQuantity: newTotal,
          },
        });

        const transaction = await tx.accessoryTransaction.create({
          data: {
            accessoryId: id,
            type,
            quantity: delta,
            reference: reference || 'MANUAL-ADJUSTMENT',
            performedBy: req.user?.name || 'Administrator',
            userId: req.user?.id || null,
            notes,
          },
        });

        return { updated, transaction };
      });

      await logAudit({
        req,
        action: 'ACCESSORY_ADJUSTED',
        entityType: 'Accessory',
        entityId: id,
        oldValue: { availableQuantity: item.availableQuantity, totalQuantity: item.totalQuantity },
        newValue: { availableQuantity: newAvail, totalQuantity: newTotal, type, quantity: delta },
      });

      res.status(200).json({
        success: true,
        message: 'Accessory stock adjusted successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id ? String(req.params.id) : undefined;
      const history = await prisma.accessoryTransaction.findMany({
        where: id ? { accessoryId: id } : {},
        include: { accessory: true },
        orderBy: { date: 'desc' },
      });

      res.status(200).json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }
}
