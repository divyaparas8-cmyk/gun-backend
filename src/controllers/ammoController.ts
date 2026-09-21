import { Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { logAudit } from '../services/auditService.js';

export class AmmoController {
  static async listAmmunition(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ammo = await prisma.ammunition.findMany({
        orderBy: { bulletType: 'asc' },
      });

      res.status(200).json({
        success: true,
        data: ammo,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getAmmunition(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const ammo = await prisma.ammunition.findUnique({
        where: { id },
        include: {
          transactions: {
            orderBy: { date: 'desc' },
            take: 50,
          },
        },
      });

      if (!ammo) {
        throw new AppError('Ammunition item not found.', 404, 'AMMO_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        data: ammo,
      });
    } catch (error) {
      next(error);
    }
  }

  static async createAmmunition(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const {
        bulletType,
        bulletTypeAr,
        calibre,
        availableQuantity,
        minimumStockLevel,
        storageLocation,
        storageLocationAr,
        condition,
        notes,
        notesAr,
      } = req.body;

      const loc = storageLocation?.trim() || 'Store Room 1';
      const cleanId = req.body.id?.trim() || `AMM-${Math.floor(100 + Math.random() * 900)}`;

      if (!bulletType?.trim() || !calibre?.trim()) {
        throw new AppError('Bullet type and calibre are required.', 400, 'MISSING_FIELDS');
      }

      const existing = await prisma.ammunition.findUnique({
        where: { calibre: calibre.trim() },
      });
      if (existing) {
        throw new AppError(`Ammunition with calibre '${calibre}' already exists. Please use 'Adjust Stock' to add rounds to this calibre.`, 400, 'DUPLICATE_CALIBRE');
      }

      const qty = parseInt(availableQuantity !== undefined ? String(availableQuantity) : '0', 10) || 0;
      const minStock = parseInt(minimumStockLevel !== undefined ? String(minimumStockLevel) : '500', 10) || 500;

      const ammo = await prisma.ammunition.create({
        data: {
          id: cleanId,
          bulletType: bulletType.trim(),
          bulletTypeAr,
          calibre: calibre.trim(),
          availableQuantity: Math.max(0, qty),
          minimumStockLevel: Math.max(0, minStock),
          storageLocation: loc,
          storageLocationAr,
          condition: condition || 'Good / Factory Sealed',
          status: qty < minStock ? 'Low Stock' : 'Healthy',
          notes,
          notesAr,
        },
      });

      if (qty > 0) {
        await prisma.ammunitionTransaction.create({
          data: {
            ammunitionId: ammo.id,
            type: 'Stock Received',
            quantity: qty,
            reference: 'INITIAL-STOCK-REGISTRY',
            performedBy: req.user?.name || 'Administrator',
            userId: req.user?.id || null,
            notes: 'Initial inventory creation',
          },
        });
      }

      await logAudit({
        req,
        action: 'AMMUNITION_RECEIVED',
        entityType: 'Ammunition',
        entityId: ammo.id,
        newValue: { bulletType: ammo.bulletType, calibre: ammo.calibre, initialQuantity: qty },
      });

      res.status(201).json({
        success: true,
        message: 'Ammunition type registered successfully',
        data: ammo,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateAmmunition(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const { bulletType, minimumStockLevel, storageLocation, condition, notes } = req.body;

      const existing = await prisma.ammunition.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError('Ammunition record not found.', 404, 'AMMO_NOT_FOUND');
      }

      const minStock = minimumStockLevel ? parseInt(minimumStockLevel, 10) : existing.minimumStockLevel;
      const status = existing.availableQuantity < minStock ? 'Low Stock' : 'Healthy';

      const updated = await prisma.ammunition.update({
        where: { id },
        data: {
          bulletType: bulletType || existing.bulletType,
          minimumStockLevel: minStock,
          storageLocation: storageLocation || existing.storageLocation,
          condition: condition || existing.condition,
          notes: notes !== undefined ? notes : existing.notes,
          status,
        },
      });

      await logAudit({
        req,
        action: 'AMMUNITION_ADJUSTED',
        entityType: 'Ammunition',
        entityId: id,
        oldValue: existing,
        newValue: updated,
      });

      res.status(200).json({
        success: true,
        message: 'Ammunition settings updated',
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

      const validTypes = [
        'Stock Received',
        'Bullets Issued',
        'Bullets Returned',
        'Bullets Used',
        'Damaged/Lost',
        'Manual Adjustment',
      ];
      if (!validTypes.includes(type)) {
        throw new AppError(`Invalid adjustment type. Must be one of: ${validTypes.join(', ')}`, 400, 'INVALID_TYPE');
      }

      const ammo = await prisma.ammunition.findUnique({ where: { id } });
      if (!ammo) {
        throw new AppError('Ammunition not found.', 404, 'AMMO_NOT_FOUND');
      }

      let newQuantity = ammo.availableQuantity;
      if (type === 'Stock Received' || type === 'Bullets Returned') {
        newQuantity += delta;
      } else {
        // Deduction types
        if (ammo.availableQuantity < delta) {
          throw new AppError(
            `Cannot deduct ${delta} rounds. Only ${ammo.availableQuantity} rounds available in stock.`,
            400,
            'INSUFFICIENT_STOCK'
          );
        }
        newQuantity -= delta;
      }

      // Update in transaction
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.ammunition.update({
          where: { id },
          data: {
            availableQuantity: newQuantity,
            status: newQuantity < ammo.minimumStockLevel ? 'Low Stock' : 'Healthy',
          },
        });

        const transaction = await tx.ammunitionTransaction.create({
          data: {
            ammunitionId: id,
            type,
            quantity: delta,
            reference: reference || 'MANUAL-ADJUSTMENT',
            performedBy: req.user?.name || 'Administrator',
            userId: req.user?.id || null,
            notes,
          },
        });

        // Low stock alert check
        if (newQuantity < ammo.minimumStockLevel) {
          const existingAlert = await tx.alert.findFirst({
            where: {
              ammunitionId: id,
              type: 'LOW_AMMUNITION_STOCK',
              status: 'OPEN',
            },
          });
          if (!existingAlert) {
            await tx.alert.create({
              data: {
                ammunitionId: id,
                type: 'LOW_AMMUNITION_STOCK',
                severity: 'HIGH',
                status: 'OPEN',
                message: `Low Ammo Alert: Stock for ${ammo.bulletType} (${ammo.calibre}) fell to ${newQuantity} rounds (threshold: ${ammo.minimumStockLevel}).`,
              },
            });
          }
        }

        return { updated, transaction };
      });

      await logAudit({
        req,
        action: 'AMMUNITION_ADJUSTED',
        entityType: 'Ammunition',
        entityId: id,
        oldValue: { availableQuantity: ammo.availableQuantity },
        newValue: { availableQuantity: newQuantity, type, quantity: delta, reference },
      });

      res.status(200).json({
        success: true,
        message: 'Stock adjusted successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getTransactions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id ? String(req.params.id) : undefined;
      const transactions = await prisma.ammunitionTransaction.findMany({
        where: id ? { ammunitionId: id } : {},
        include: { ammunition: true },
        orderBy: { date: 'desc' },
      });

      res.status(200).json({
        success: true,
        data: transactions,
      });
    } catch (error) {
      next(error);
    }
  }
}
