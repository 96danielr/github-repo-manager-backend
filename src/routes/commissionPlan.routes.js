import { Router } from 'express';
import {
  getCommissionPlans,
  createCommissionPlan,
  updateCommissionPlan,
  deleteCommissionPlan,
} from '../controllers/commissionPlan.controller.js';
import { protect, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';

const router = Router();

router.use(protect);
router.use(tenantMiddleware);
router.use(companyMiddleware);

router.get('/', checkPermission(PERMISSIONS.COMISIONES_VIEW), getCommissionPlans);
router.post('/', checkPermission(PERMISSIONS.COMISIONES_MANAGE), createCommissionPlan);
router.put('/:id', checkPermission(PERMISSIONS.COMISIONES_MANAGE), updateCommissionPlan);
router.delete('/:id', checkPermission(PERMISSIONS.COMISIONES_MANAGE), deleteCommissionPlan);

export default router;
