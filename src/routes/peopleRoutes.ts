import { Router } from 'express';
import { PeopleController } from '../controllers/peopleController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('people.view'), PeopleController.listPeople);
router.get('/:id', requirePermission('people.view'), PeopleController.getPerson);
router.post('/', requirePermission('people.create'), PeopleController.createPerson);
router.patch('/:id', requirePermission('people.edit'), PeopleController.updatePerson);
router.patch('/:id/block', requirePermission('people.block'), PeopleController.blockPerson);
router.patch('/:id/status', requirePermission('people.block'), PeopleController.updateStatus);
router.get('/:id/gun-history', requirePermission('people.view'), PeopleController.getGunHistory);

export default router;
