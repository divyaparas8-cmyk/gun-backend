import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { logAudit } from '../services/auditService.js';
export class PeopleController {
    static async listPeople(req, res, next) {
        try {
            const { search, department, status, page, limit } = req.query;
            const where = {};
            if (department && typeof department === 'string' && department !== 'All Departments') {
                where.department = department;
            }
            if (status && typeof status === 'string' && status !== 'All Status') {
                where.status = status;
            }
            if (search && typeof search === 'string' && search.trim() !== '') {
                const q = search.trim();
                where.OR = [
                    { fullName: { contains: q } },
                    { fullNameAr: { contains: q } },
                    { employeeId: { contains: q } },
                    { idDocument: { contains: q } },
                    { phone: { contains: q } },
                ];
            }
            const take = limit ? parseInt(limit, 10) : undefined;
            const skip = page && limit ? (parseInt(page, 10) - 1) * take : undefined;
            const [people, total] = await Promise.all([
                prisma.person.findMany({
                    where,
                    take,
                    skip,
                    orderBy: { createdAt: 'desc' },
                }),
                prisma.person.count({ where }),
            ]);
            res.status(200).json({
                success: true,
                data: people,
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
    static async getPerson(req, res, next) {
        try {
            const id = String(req.params.id);
            const person = await prisma.person.findUnique({
                where: { id },
                include: {
                    leases: {
                        include: {
                            gun: true,
                            returnRecord: true,
                        },
                        orderBy: { createdAt: 'desc' },
                    },
                },
            });
            if (!person) {
                throw new AppError('Person not found.', 404, 'PERSON_NOT_FOUND');
            }
            res.status(200).json({
                success: true,
                data: person,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async createPerson(req, res, next) {
        try {
            const { fullName, fullNameAr, employeeId, phone, department, departmentAr, rank, rankAr, designation, designationAr, idDocument, address, addressAr, supervisingOfficer, avatar, notes, notesAr, status, blockedReason, } = req.body;
            if (!fullName || !employeeId || !phone) {
                throw new AppError('Full name, Employee ID, and Phone are required.', 400, 'MISSING_FIELDS');
            }
            const finalIdDoc = (idDocument && idDocument.trim()) ? idDocument.trim() : `DOC-${employeeId.trim().toUpperCase()}`;
            const finalDept = department?.trim() || 'General Patrol';
            const finalRank = rank?.trim() || 'Officer';
            const finalDesig = designation?.trim() || 'Patrol Officer';
            const existing = await prisma.person.findFirst({
                where: {
                    OR: [
                        { employeeId: employeeId.trim().toUpperCase() },
                        ...(idDocument && idDocument.trim() ? [{ idDocument: idDocument.trim() }] : []),
                    ],
                },
            });
            if (existing) {
                throw new AppError(`Person with Employee ID '${employeeId}' already exists.`, 400, 'DUPLICATE_PERSON');
            }
            const person = await prisma.person.create({
                data: {
                    fullName,
                    fullNameAr,
                    employeeId: employeeId.trim().toUpperCase(),
                    phone,
                    department: finalDept,
                    departmentAr,
                    rank: finalRank,
                    rankAr,
                    designation: finalDesig,
                    designationAr,
                    idDocument: finalIdDoc,
                    address: address || '',
                    addressAr,
                    supervisingOfficer: supervisingOfficer || '',
                    avatar,
                    notes,
                    notesAr,
                    status: status || 'Active',
                    blockedReason: status === 'Blocked' ? blockedReason : null,
                },
            });
            await logAudit({
                req,
                action: 'CREATE_PERSON',
                entityType: 'Person',
                entityId: person.id,
                newValue: { fullName: person.fullName, employeeId: person.employeeId },
            });
            res.status(201).json({
                success: true,
                message: 'Person registered successfully',
                data: person,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async updatePerson(req, res, next) {
        try {
            const id = String(req.params.id);
            const updateData = { ...req.body };
            const existing = await prisma.person.findUnique({ where: { id } });
            if (!existing) {
                throw new AppError('Person not found.', 404, 'PERSON_NOT_FOUND');
            }
            delete updateData.id;
            delete updateData.createdAt;
            const updated = await prisma.person.update({
                where: { id },
                data: updateData,
            });
            await logAudit({
                req,
                action: 'UPDATE_PERSON',
                entityType: 'Person',
                entityId: id,
                oldValue: existing,
                newValue: updated,
            });
            res.status(200).json({
                success: true,
                message: 'Person updated successfully',
                data: updated,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async blockPerson(req, res, next) {
        try {
            const id = String(req.params.id);
            const { blocked, reason } = req.body;
            const existing = await prisma.person.findUnique({ where: { id } });
            if (!existing) {
                throw new AppError('Person not found.', 404, 'PERSON_NOT_FOUND');
            }
            const newStatus = blocked ? 'Blocked' : 'Active';
            const updated = await prisma.person.update({
                where: { id },
                data: {
                    status: newStatus,
                    blockedReason: blocked ? reason || 'Administrative block' : null,
                },
            });
            await logAudit({
                req,
                action: 'BLOCK_PERSON',
                entityType: 'Person',
                entityId: id,
                oldValue: { status: existing.status, blockedReason: existing.blockedReason },
                newValue: { status: newStatus, blockedReason: updated.blockedReason },
            });
            res.status(200).json({
                success: true,
                message: blocked ? 'Person has been blocked from receiving firearms.' : 'Person unblocked successfully.',
                data: updated,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async updateStatus(req, res, next) {
        try {
            const id = String(req.params.id);
            const { status } = req.body;
            if (!['Active', 'Inactive', 'Blocked'].includes(status)) {
                throw new AppError('Status must be Active, Inactive, or Blocked.', 400, 'INVALID_STATUS');
            }
            const existing = await prisma.person.findUnique({ where: { id } });
            if (!existing) {
                throw new AppError('Person not found.', 404, 'PERSON_NOT_FOUND');
            }
            const updated = await prisma.person.update({
                where: { id },
                data: { status },
            });
            await logAudit({
                req,
                action: 'UPDATE_PERSON_STATUS',
                entityType: 'Person',
                entityId: id,
                oldValue: { status: existing.status },
                newValue: { status },
            });
            res.status(200).json({
                success: true,
                message: `Person status changed to ${status}`,
                data: updated,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getGunHistory(req, res, next) {
        try {
            const id = String(req.params.id);
            const leases = await prisma.lease.findMany({
                where: { personId: id },
                include: {
                    gun: true,
                    pistol: true,
                    returnRecord: true,
                    remarks: true,
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
