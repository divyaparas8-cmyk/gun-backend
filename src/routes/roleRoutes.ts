import { Router } from 'express';
import { RoleController } from '../controllers/roleController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('roles.view'), RoleController.listRoles);
router.patch('/:roleName/permissions', requirePermission('roles.manage'), RoleController.updateRolePermissions);

export default router;
