import { Router } from 'express';
import {
  getBonuses,
  createBonus,
  updateBonus,
  deleteBonus,
} from '../controllers/bonus.controller.js';
import { protect, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';

const router = Router();

// Require authentication and tenant context
router.use(protect);
router.use(tenantMiddleware);
router.use(companyMiddleware);

// Config permissions: use CONFIG_TENANT for managing bonuses, and LOTES_VIEW for listing
router.get('/', getBonuses);
router.post('/', checkPermission(PERMISSIONS.CONFIG_TENANT), createBonus);
router.put('/:id', checkPermission(PERMISSIONS.CONFIG_TENANT), updateBonus);
router.delete('/:id', checkPermission(PERMISSIONS.CONFIG_TENANT), deleteBonus);

export default router;
