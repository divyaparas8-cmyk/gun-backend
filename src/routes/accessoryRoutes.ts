import { Router } from 'express';
import { AccessoryController } from '../controllers/accessoryController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('accessories.view'), AccessoryController.listAccessories);
router.get('/:id', requirePermission('accessories.view'), AccessoryController.getAccessory);
router.post('/', requirePermission('accessories.adjust'), AccessoryController.createAccessory);
router.patch('/:id', requirePermission('accessories.adjust'), AccessoryController.updateAccessory);
router.post('/:id/adjust-stock', requirePermission('accessories.adjust'), AccessoryController.adjustStock);
router.get('/:id/history', requirePermission('accessories.view'), AccessoryController.getHistory);

export default router;
