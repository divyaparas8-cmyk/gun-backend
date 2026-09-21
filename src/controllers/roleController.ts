import { Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { logAudit } from '../services/auditService.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../middlewares/permissionMiddleware.js';

export class RoleController {
  static async listRoles(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const roles = await prisma.role.findMany({
        orderBy: { name: 'asc' },
      });

      // If roles table is empty, seed defaults
      if (roles.length === 0) {
        const seededRoles = [];
        for (const [name, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
          const created = await prisma.role.create({
            data: {
              name,
              description: `${name} role in armory system`,
              permissions: JSON.stringify(perms),
            },
          });
          seededRoles.push({
            ...created,
            permissions: perms,
          });
        }
        return res.status(200).json({ success: true, data: seededRoles });
      }

      const formatted = roles.map((r: { id: string; name: string; description: string | null; permissions: string; createdAt: Date; updatedAt: Date }) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        permissions: JSON.parse(r.permissions || '[]'),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));

      res.status(200).json({
        success: true,
        data: formatted,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateRolePermissions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const roleName = String(req.params.roleName);
      const { permissions } = req.body;

      if (!Array.isArray(permissions)) {
        throw new AppError('Permissions must be an array of string permission keys.', 400, 'INVALID_PAYLOAD');
      }

      const existingRole = await prisma.role.findUnique({
        where: { name: roleName },
      });

      let updated: any = null;
      if (existingRole) {
        updated = await prisma.role.update({
          where: { name: roleName },
          data: {
            permissions: JSON.stringify(permissions),
          },
        });
      } else {
        updated = await prisma.role.create({
          data: {
            name: roleName,
            permissions: JSON.stringify(permissions),
          },
        });
      }

      await logAudit({
        req,
        action: 'PERMISSION_CHANGED',
        entityType: 'Role',
        entityId: roleName,
        newValue: { permissions },
      });

      res.status(200).json({
        success: true,
        message: `Permissions updated for role ${roleName}`,
        data: {
          id: updated.id,
          name: updated.name,
          permissions,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
