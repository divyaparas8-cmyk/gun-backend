import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { logAudit } from '../services/auditService.js';
export class GunController {
    static async listGuns(req, res, next) {
        try {
            const { status, gunType, location, search, page, limit } = req.query;
            const where = {};
            if (status && typeof status === 'string' && status !== 'All Status') {
                where.status = status;
            }
            if (gunType && typeof gunType === 'string' && gunType !== 'All Types') {
                where.gunType = gunType;
            }
            if (location && typeof location === 'string' && location !== 'All Locations') {
                where.location = location;
            }
            if (search && typeof search === 'string' && search.trim() !== '') {
                const q = search.trim();
                where.OR = [
                    { serialNumber: { contains: q } },
                    { model: { contains: q } },
                    { brand: { contains: q } },
                    { calibre: { contains: q } },
                ];
            }
            const take = limit ? parseInt(limit, 10) : undefined;
            const skip = page && limit ? (parseInt(page, 10) - 1) * take : undefined;
            const [guns, total] = await Promise.all([
                prisma.gun.findMany({
                    where,
                    take,
                    skip,
                    orderBy: { createdAt: 'desc' },
                }),
                prisma.gun.count({ where }),
            ]);
            res.status(200).json({
                success: true,
                data: guns,
                meta: {
                    total,
                    page: page ? parseInt(page, 10) : 1,
                    limit: take || total,
                    totalPages: take ? Math.ceil(total / take) : 1,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getGun(req, res, next) {
        try {
            const id = String(req.params.id);
            const gun = await prisma.gun.findUnique({
                where: { id },
                include: {
                    primaryLeases: {
                        include: {
                            person: true,
                            returnRecord: true,
                        },
                        orderBy: { createdAt: 'desc' },
                    },
                },
            });
            if (!gun) {
                throw new AppError('Gun not found.', 404, 'GUN_NOT_FOUND');
            }
            res.status(200).json({
                success: true,
                data: gun,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async createGun(req, res, next) {
        try {
            const { serialNumber, gunType, brand, model, modelAr, calibre, purchaseDate, condition, location, locationAr, status, magazineCapacity, defaultBullets, actionType, barrelLength, notes, notesAr, } = req.body;
            if (!serialNumber || !gunType || !brand || !model || !calibre || !location) {
                throw new AppError('Serial number, gun type, brand, model, calibre, and storage location are required.', 400, 'MISSING_FIELDS');
            }
            const existing = await prisma.gun.findUnique({
                where: { serialNumber: serialNumber.trim().toUpperCase() },
            });
            if (existing) {
                throw new AppError(`Gun with Serial Number '${serialNumber}' already exists in registry.`, 400, 'DUPLICATE_SERIAL');
            }
            const cleanId = req.body.id?.trim() || `${gunType === 'Pistol' || gunType === 'Handgun' ? 'PST' : 'GUN'}-${Math.floor(100 + Math.random() * 900)}`;
            const gun = await prisma.gun.create({
                data: {
                    id: cleanId,
                    serialNumber: serialNumber.trim().toUpperCase(),
                    gunType,
                    brand,
                    model,
                    modelAr,
                    calibre,
                    purchaseDate: purchaseDate || new Date().toISOString().split('T')[0],
                    condition: condition || 'Excellent',
                    location,
                    locationAr,
                    status: status || 'Available',
                    magazineCapacity: magazineCapacity ? parseInt(magazineCapacity, 10) : 15,
                    defaultBullets: defaultBullets ? parseInt(defaultBullets, 10) : 30,
                    actionType,
                    barrelLength,
                    notes,
                    notesAr,
                },
            });
            await logAudit({
                req,
                action: 'CREATE_GUN',
                entityType: 'Gun',
                entityId: gun.id,
                newValue: { serialNumber: gun.serialNumber, model: gun.model, status: gun.status },
            });
            res.status(201).json({
                success: true,
                message: 'Firearm registered successfully',
                data: gun,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async updateGun(req, res, next) {
        try {
            const id = String(req.params.id);
            const updateData = { ...req.body };
            const existing = await prisma.gun.findUnique({ where: { id } });
            if (!existing) {
                throw new AppError('Gun not found.', 404, 'GUN_NOT_FOUND');
            }
            delete updateData.id;
            delete updateData.createdAt;
            const updated = await prisma.gun.update({
                where: { id },
                data: updateData,
            });
            await logAudit({
                req,
                action: 'UPDATE_GUN',
                entityType: 'Gun',
                entityId: id,
                oldValue: existing,
                newValue: updated,
            });
            res.status(200).json({
                success: true,
                message: 'Firearm details updated',
                data: updated,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async setMaintenance(req, res, next) {
        try {
            const id = String(req.params.id);
            const { maintenance, reason } = req.body;
            const existing = await prisma.gun.findUnique({ where: { id } });
            if (!existing) {
                throw new AppError('Gun not found.', 404, 'GUN_NOT_FOUND');
            }
            if (existing.status === 'Leased') {
                throw new AppError('Cannot put a currently leased firearm into maintenance. Gun must be returned first.', 400, 'GUN_LEASED');
            }
            const newStatus = maintenance ? 'Maintenance' : 'Available';
            const updated = await prisma.gun.update({
                where: { id },
                data: {
                    status: newStatus,
                    notes: reason ? `${existing.notes || ''} [Maintenance: ${reason}]`.trim() : existing.notes,
                },
            });
            await logAudit({
                req,
                action: 'GUN_STATUS_CHANGED',
                entityType: 'Gun',
                entityId: id,
                oldValue: { status: existing.status },
                newValue: { status: newStatus, reason },
            });
            res.status(200).json({
                success: true,
                message: maintenance ? 'Firearm placed in maintenance' : 'Firearm returned to available service',
                data: updated,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async setUnavailable(req, res, next) {
        try {
            const id = String(req.params.id);
            const { unavailable, reason } = req.body;
            const existing = await prisma.gun.findUnique({ where: { id } });
            if (!existing) {
                throw new AppError('Gun not found.', 404, 'GUN_NOT_FOUND');
            }
            const newStatus = unavailable ? 'Unavailable' : 'Available';
            const updated = await prisma.gun.update({
                where: { id },
                data: {
                    status: newStatus,
                    notes: reason ? `${existing.notes || ''} [Unavailable: ${reason}]`.trim() : existing.notes,
                },
            });
            await logAudit({
                req,
                action: 'GUN_STATUS_CHANGED',
                entityType: 'Gun',
                entityId: id,
                oldValue: { status: existing.status },
                newValue: { status: newStatus, reason },
            });
            res.status(200).json({
                success: true,
                message: unavailable ? 'Firearm marked as unavailable' : 'Firearm marked as available',
                data: updated,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getLeaseHistory(req, res, next) {
        try {
            const id = String(req.params.id);
            const leases = await prisma.lease.findMany({
                where: {
                    OR: [{ gunId: id }, { pistolId: id }],
                },
                include: {
                    person: true,
                    returnRecord: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            res.status(200).json({
                success: true,
                data: leases,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
