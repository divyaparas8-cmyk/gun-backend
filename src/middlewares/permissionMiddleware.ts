import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRoleType } from '../types/index.js';
import { AppError } from './errorHandler.js';
import { prisma } from '../config/prisma.js';

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  Administrator: [
    'dashboard.view',
    'people.view',
    'people.create',
    'people.edit',
    'people.block',
    'gun.view',
    'gun.create',
    'gun.edit',
    'gun.issue',
    'lease.view',
    'lease.create',
    'lease.return',
    'lease.cancel',
    'ammo.view',
    'ammo.adjust',
    'accessories.view',
    'accessories.adjust',
    'alerts.view',
    'alerts.remark',
    'reports.view',
    'reports.export',
    'users.view',
    'users.manage',
    'roles.view',
    'roles.manage',
    'masterdata.view',
    'masterdata.manage',
    'notifications.view',
    'notifications.manage',
    'audit.view',
  ],
  'Supervising Officer': [
    'dashboard.view',
    'people.view',
    'gun.view',
    'lease.view',
    'ammo.view',
    'accessories.view',
    'alerts.view',
    'alerts.remark',
    'reports.view',
    'reports.export',
    'audit.view',
  ],
  'Issuing Officer': [
    'dashboard.view',
    'people.view',
    'gun.view',
    'gun.issue',
    'lease.view',
    'lease.create',
    'lease.return',
    'ammo.view',
    'ammo.adjust',
    'accessories.view',
    'accessories.adjust',
    'alerts.view',
  ],
  Viewer: [
    'dashboard.view',
    'people.view',
    'gun.view',
    'lease.view',
    'ammo.view',
    'accessories.view',
    'alerts.view',
    'reports.view',
    'audit.view',
  ],
  'Viewer / Auditor': [
    'dashboard.view',
    'people.view',
    'gun.view',
    'lease.view',
    'ammo.view',
    'accessories.view',
    'alerts.view',
    'reports.view',
    'audit.view',
  ],
  'Armory Auditor': [
    'dashboard.view',
    'people.view',
    'gun.view',
    'lease.view',
    'ammo.view',
    'accessories.view',
    'alerts.view',
    'reports.view',
    'audit.view',
  ],
};

export const requirePermission = (permission: string) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
      }

      const role = req.user.role;

      // Administrator always has full bypass
      if (role === 'Administrator') {
        return next();
      }

      // Check dynamic DB role first
      const dbRole = await prisma.role.findUnique({
        where: { name: role },
      });

      let permissions: string[] = [];
      if (dbRole && dbRole.permissions) {
        try {
          permissions = JSON.parse(dbRole.permissions);
        } catch {
          permissions = DEFAULT_ROLE_PERMISSIONS[role] || [];
        }
      } else {
        permissions = DEFAULT_ROLE_PERMISSIONS[role] || [];
      }

      // Map equivalent aliases if needed (e.g., people.update -> people.edit)
      const allowed =
        permissions.includes(permission) ||
        (permission === 'people.update' && permissions.includes('people.edit')) ||
        (permission === 'guns.create' && permissions.includes('gun.create')) ||
        (permission === 'guns.view' && permissions.includes('gun.view')) ||
        (permission === 'guns.update' && permissions.includes('gun.edit')) ||
        (permission === 'leases.create' && (permissions.includes('lease.create') || permissions.includes('gun.issue'))) ||
        (permission === 'leases.return' && permissions.includes('lease.return')) ||
        (permission === 'ammunition.adjust' && permissions.includes('ammo.adjust')) ||
        (permission === 'ammunition.view' && permissions.includes('ammo.view'));

      if (!allowed) {
        throw new AppError(
          `Access denied. You lack the '${permission}' permission required for this action.`,
          403,
          'FORBIDDEN'
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const requireRoles = (roles: UserRoleType[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    if (req.user.role === 'Administrator' || roles.includes(req.user.role)) {
      return next();
    }

    next(
      new AppError(
        `Forbidden. Access restricted to roles: [${roles.join(', ')}].`,
        403,
        'FORBIDDEN'
      )
    );
  };
};
