import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { LeaseService } from '../services/leaseService.js';
export class LeaseController {
    static async listLeases(req, res, next) {
        try {
            const { status, department, search, dateFrom, dateTo, page, limit } = req.query;
            const where = {};
            if (status && typeof status === 'string' && status !== 'All Status') {
                where.status = status;
            }
            if (department && typeof department === 'string' && department !== 'All Departments') {
                where.person = { department };
            }
            if (search && typeof search === 'string' && search.trim() !== '') {
                const q = search.trim();
                where.OR = [
                    { id: { contains: q } },
                    { person: { fullName: { contains: q } } },
                    { person: { employeeId: { contains: q } } },
                    { gun: { serialNumber: { contains: q } } },
                    { gun: { model: { contains: q } } },
                ];
            }
            if (dateFrom || dateTo) {
                where.issueDate = {};
                if (dateFrom)
                    where.issueDate.gte = String(dateFrom);
                if (dateTo)
                    where.issueDate.lte = String(dateTo);
            }
            const take = limit ? parseInt(limit, 10) : undefined;
            const skip = page && limit ? (parseInt(page, 10) - 1) * take : undefined;
            const [leases, total] = await Promise.all([
                prisma.lease.findMany({
                    where,
                    include: {
                        person: true,
                        gun: true,
                        pistol: true,
                        returnRecord: true,
                        remarks: {
                            orderBy: { createdAt: 'desc' },
                        },
                    },
                    take,
                    skip,
                    orderBy: { createdAt: 'desc' },
                }),
                prisma.lease.count({ where }),
            ]);
            // Format response to match frontend LeaseRecord
            const formatted = leases.map((l) => ({
                id: l.id,
                personId: l.personId,
                personName: l.person.fullName,
                employeeId: l.person.employeeId,
                department: l.person.department,
                rank: l.person.rank,
                designation: l.person.designation,
                supervisingOfficer: l.person.supervisingOfficer,
                gunId: l.gunId,
                gunSerial: l.gun.serialNumber,
                gunModel: l.gun.model,
                gunType: l.gun.gunType,
                gunCalibre: l.gun.calibre,
                gunBulletsIssued: l.gunBulletsIssued,
                pistolId: l.pistolId || undefined,
                pistolSerial: l.pistol?.serialNumber || undefined,
                pistolModel: l.pistol?.model || undefined,
                pistolCalibre: l.pistol?.calibre || undefined,
                pistolBulletsIssued: l.pistolBulletsIssued || undefined,
                weapons: l.weaponsJson ? JSON.parse(l.weaponsJson) : undefined,
                issueDate: l.issueDate,
                issueTime: l.issueTime,
                expectedReturnDate: l.expectedReturnDate,
                expectedReturnTime: l.expectedReturnTime,
                purpose: l.purpose,
                locationOfUse: l.locationOfUse,
                bulletsIssued: l.bulletsIssued,
                accessoriesIssued: JSON.parse(l.accessoriesIssuedJson || '[]'),
                issuingOfficer: l.issuingOfficer,
                receiverSignatureConfirmed: l.receiverSignatureConfirmed,
                status: l.status,
                notes: l.notes,
                overdueDurationHours: l.overdueDurationHours,
                returnDetails: l.returnRecord
                    ? {
                        actualReturnDate: l.returnRecord.actualReturnDate,
                        actualReturnTime: l.returnRecord.actualReturnTime,
                        gunCondition: l.returnRecord.gunCondition,
                        bulletsIssued: l.returnRecord.bulletsIssued,
                        bulletsUsed: l.returnRecord.bulletsUsed,
                        bulletsReturned: l.returnRecord.bulletsReturned,
                        gunBulletsIssued: l.returnRecord.gunBulletsIssued,
                        gunBulletsUsed: l.returnRecord.gunBulletsUsed,
                        gunBulletsReturned: l.returnRecord.gunBulletsReturned,
                        pistolBulletsIssued: l.returnRecord.pistolBulletsIssued,
                        pistolBulletsUsed: l.returnRecord.pistolBulletsUsed,
                        pistolBulletsReturned: l.returnRecord.pistolBulletsReturned,
                        weapons: l.returnRecord.weaponsJson ? JSON.parse(l.returnRecord.weaponsJson) : undefined,
                        accessoriesIssued: JSON.parse(l.returnRecord.accessoriesIssuedJson || '[]'),
                        accessoriesReturned: JSON.parse(l.returnRecord.accessoriesReturnedJson || '[]'),
                        missingAccessories: l.returnRecord.missingAccessories,
                        damageInformation: l.returnRecord.damageInformation,
                        returnReceivedBy: l.returnRecord.returnReceivedBy,
                        receiverSignatureConfirmed: l.returnRecord.receiverSignatureConfirmed,
                        notes: l.returnRecord.notes,
                    }
                    : undefined,
                followUpRemarks: l.remarks.map((r) => ({
                    date: r.createdAt.toISOString().replace('T', ' ').substring(0, 16),
                    officer: r.officer,
                    remark: r.remark,
                })),
            }));
            res.status(200).json({
                success: true,
                data: formatted,
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
    static async getLease(req, res, next) {
        try {
            const id = String(req.params.id);
            const lease = await prisma.lease.findUnique({
                where: { id },
                include: {
                    person: true,
                    gun: true,
                    pistol: true,
                    returnRecord: true,
                    remarks: {
                        orderBy: { createdAt: 'desc' },
                    },
                    alerts: true,
                },
            });
            if (!lease) {
                throw new AppError('Lease record not found.', 404, 'LEASE_NOT_FOUND');
            }
            res.status(200).json({
                success: true,
                data: lease,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async issueGun(req, res, next) {
        try {
            const result = await LeaseService.issueGun(req, req.body);
            res.status(201).json({
                success: true,
                message: 'Firearms and accessories successfully issued.',
                data: result,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async returnGun(req, res, next) {
        try {
            const leaseId = String(req.params.leaseId);
            const result = await LeaseService.returnGun(req, leaseId, req.body);
            res.status(200).json({
                success: true,
                message: 'Firearm return and ammunition reconciliation successfully completed.',
                data: result,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async cancelLease(req, res, next) {
        try {
            const id = String(req.params.id);
            const result = await LeaseService.cancelLease(req, id);
            res.status(200).json({
                success: true,
                message: 'Lease cancelled and inventory reverted.',
                data: result,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getLeaseHistory(req, res, next) {
        try {
            const id = String(req.params.id);
            const auditLogs = await prisma.auditLog.findMany({
                where: {
                    OR: [
                        { entityId: id },
                        { newValue: { contains: id } },
                    ],
                },
                orderBy: { createdAt: 'desc' },
            });
            res.status(200).json({
                success: true,
                data: auditLogs,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
