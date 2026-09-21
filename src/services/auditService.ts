import { prisma } from '../config/prisma.js';
import { Request } from 'express';
import { AuthenticatedRequest } from '../types/index.js';

export interface AuditLogParams {
  req?: AuthenticatedRequest | Request;
  userId?: string;
  userEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: any;
  newValue?: any;
}

export const logAudit = async ({
  req,
  userId,
  userEmail,
  action,
  entityType,
  entityId,
  oldValue,
  newValue,
}: AuditLogParams): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const finalUserId = userId || authReq?.user?.id || null;
    const finalUserEmail = userEmail || authReq?.user?.email || null;

    let ipAddress: string | null = null;
    let userAgent: string | null = null;

    if (req) {
      ipAddress =
        (req.headers['x-forwarded-for'] as string) ||
        req.socket.remoteAddress ||
        null;
      userAgent = req.headers['user-agent'] || null;
    }

    // Sanitize any sensitive keys
    const sanitize = (val: any) => {
      if (!val) return null;
      if (typeof val === 'string') return val;
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
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
};
