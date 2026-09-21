import { prisma } from '../config/prisma.js';
export class DashboardController {
    static async getSummary(req, res, next) {
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const [totalGuns, availableGuns, leasedGuns, maintenanceGuns, unavailableGuns, activeLeases, dueTodayLeases, overdueLeases, totalPeople, activePeople, lowStockAmmo, openAlerts,] = await Promise.all([
                prisma.gun.count(),
                prisma.gun.count({ where: { status: 'Available' } }),
                prisma.gun.count({ where: { status: 'Leased' } }),
                prisma.gun.count({ where: { status: 'Maintenance' } }),
                prisma.gun.count({ where: { status: 'Unavailable' } }),
                prisma.lease.count({ where: { status: 'Active' } }),
                prisma.lease.count({
                    where: {
                        OR: [
                            { status: 'Due Today' },
                            { status: 'Active', expectedReturnDate: todayStr },
                        ],
                    },
                }),
                prisma.lease.count({ where: { status: 'Overdue' } }),
                prisma.person.count(),
                prisma.person.count({ where: { status: 'Active' } }),
                prisma.ammunition.count({ where: { status: 'Low Stock' } }),
                prisma.alert.count({ where: { status: 'OPEN' } }),
            ]);
            res.status(200).json({
                success: true,
                data: {
                    totalGuns,
                    availableGuns,
                    leasedGuns,
                    maintenanceGuns,
                    unavailableGuns,
                    activeLeases,
                    dueTodayLeases,
                    overdueLeases,
                    totalPeople,
                    activePeople,
                    lowStockAmmo,
                    openAlerts,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getRecentActivity(req, res, next) {
        try {
            const logs = await prisma.auditLog.findMany({
                take: 15,
                orderBy: { createdAt: 'desc' },
                include: { user: true },
            });
            const formatted = logs.map((log) => {
                let actionDesc = log.action;
                let moduleName = 'Lease Records';
                if (log.entityType === 'Gun')
                    moduleName = 'Gun Register';
                else if (log.entityType === 'Person')
                    moduleName = 'People';
                else if (log.entityType === 'Ammunition')
                    moduleName = 'Ammunition';
                else if (log.entityType === 'Accessory')
                    moduleName = 'Accessories';
                else if (log.entityType === 'Alert')
                    moduleName = 'Alerts';
                else if (log.entityType === 'User' || log.entityType === 'Role')
                    moduleName = 'Settings';
                let description = `${log.action} performed on ${log.entityType} ${log.entityId || ''}`;
                try {
                    if (log.newValue) {
                        const parsed = JSON.parse(log.newValue);
                        if (log.action === 'CREATE_LEASE') {
                            description = `Issued firearm (${parsed.primaryGun}) to ${parsed.person}. Lease #${log.entityId}`;
                        }
                        else if (log.action === 'PROCESS_RETURN') {
                            description = `Returned lease #${log.entityId}. Condition: ${parsed.gunCondition}. Bullets returned: ${parsed.bulletsReturned}.`;
                        }
                        else if (log.action === 'CREATE_PERSON') {
                            description = `Registered new officer: ${parsed.fullName} (${parsed.employeeId}).`;
                        }
                        else if (log.action === 'BLOCK_PERSON') {
                            description = `Blocked officer #${log.entityId} from receiving firearms.`;
                        }
                        else if (log.action === 'CREATE_GUN') {
                            description = `Added new weapon to register: ${parsed.model} (SN: ${parsed.serialNumber}).`;
                        }
                        else if (log.action === 'AMMUNITION_ADJUSTED') {
                            description = `Ammunition stock adjusted (${parsed.type || 'Manual'}): ${parsed.quantity || ''} rounds.`;
                        }
                        else if (log.action === 'ADD_ALERT_REMARK') {
                            description = `Follow-up remark added by ${parsed.officer}: "${parsed.remark}"`;
                        }
                    }
                }
                catch { }
                return {
                    id: log.id,
                    timestamp: log.createdAt.toISOString().replace('T', ' ').substring(0, 16),
                    performedBy: log.user?.name || log.userEmail || 'System / Officer',
                    module: moduleName,
                    action: actionDesc,
                    description,
                    recordId: log.entityId || undefined,
                };
            });
            res.status(200).json({
                success: true,
                data: formatted,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getActionItems(req, res, next) {
        try {
            const [overdueLeases, openAlerts, lowAmmo] = await Promise.all([
                prisma.lease.findMany({
                    where: { status: 'Overdue' },
                    include: { person: true, gun: true },
                    take: 10,
                }),
                prisma.alert.findMany({
                    where: { status: 'OPEN' },
                    include: { lease: { include: { person: true } }, gun: true },
                    take: 10,
                }),
                prisma.ammunition.findMany({
                    where: { status: 'Low Stock' },
                    take: 10,
                }),
            ]);
            res.status(200).json({
                success: true,
                data: {
                    overdueLeases,
                    openAlerts,
                    lowAmmo,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
}
