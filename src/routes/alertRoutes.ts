import { Router } from 'express';
import { AlertController } from '../controllers/alertController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('alerts.view'), AlertController.listAlerts);
router.get('/:id', requirePermission('alerts.view'), AlertController.getAlert);
router.post('/:id/remarks', requirePermission('alerts.remark'), AlertController.addRemark);
router.patch('/:id/resolve', requirePermission('alerts.remark'), AlertController.resolveAlert);

export default router;
