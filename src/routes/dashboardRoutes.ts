import { Router } from 'express';
import { DashboardController } from '../controllers/dashboardController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = Router();

router.use(authenticate);

router.get('/summary', requirePermission('dashboard.view'), DashboardController.getSummary);
router.get('/recent-activity', requirePermission('dashboard.view'), DashboardController.getRecentActivity);
router.get('/action-items', requirePermission('dashboard.view'), DashboardController.getActionItems);

export default router;
