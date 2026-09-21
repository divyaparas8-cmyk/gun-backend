import { Router } from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import roleRoutes from './roleRoutes.js';
import peopleRoutes from './peopleRoutes.js';
import gunRoutes from './gunRoutes.js';
import ammoRoutes from './ammoRoutes.js';
import accessoryRoutes from './accessoryRoutes.js';
import leaseRoutes from './leaseRoutes.js';
import alertRoutes from './alertRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import reportRoutes from './reportRoutes.js';
import {
  locationRouter,
  departmentRouter,
  auditRouter,
  settingsRouter,
} from './masterRoutes.js';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/roles', roleRoutes);
apiRouter.use('/people', peopleRoutes);
apiRouter.use('/guns', gunRoutes);
apiRouter.use('/ammunition', ammoRoutes);
apiRouter.use('/accessories', accessoryRoutes);
apiRouter.use('/leases', leaseRoutes);
apiRouter.use('/alerts', alertRoutes);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/reports', reportRoutes);
apiRouter.use('/locations', locationRouter);
apiRouter.use('/departments', departmentRouter);
apiRouter.use('/audit', auditRouter);
apiRouter.use('/settings', settingsRouter);

export default apiRouter;
