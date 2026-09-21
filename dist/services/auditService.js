import { prisma } from '../config/prisma.js';
export const logAudit = async ({ req, userId, userEmail, action, entityType, entityId, oldValue, newValue, }) => {
    try {
        const authReq = req;
        const finalUserId = userId || authReq?.user?.id || null;
        const finalUserEmail = userEmail || authReq?.user?.email || null;
        let ipAddress = null;
        let userAgent = null;
        if (req) {
            ipAddress =
                req.headers['x-forwarded-for'] ||
                    req.socket.remoteAddress ||
                    null;
            userAgent = req.headers['user-agent'] || null;
        }
        // Sanitize any sensitive keys
        const sanitize = (val) => {
            if (!val)
                return null;
            if (typeof val === 'string')
                return val;
            const copy = { ...val };
            delete copy.password;
            delete copy.passwordHash;
            return JSON.stringify(copy);
        };
        await prisma.auditLog.create({
            data: {
                userId: finalUserId,
                userEmail: finalUserEmail,
                action,
                entityType,
                entityId: entityId ? String(entityId) : null,
                oldValue: sanitize(oldValue),
                newValue: sanitize(newValue),
                ipAddress,
                userAgent,
            },
        });
    }
    catch (error) {
        console.error('Failed to create audit log:', error);
    }
};
