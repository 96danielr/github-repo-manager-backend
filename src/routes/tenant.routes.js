import express from 'express';
import { 
  createTenantWithAdmin, 
  getAllTenants, 
  updateTenant,
  getMyTenant,
  updateMyTenant
} from '../controllers/tenant.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

// Routes for Tenant Admin (managing their own Tenant)
router.get('/me', getMyTenant);
router.put('/me', restrictTo('tenant_admin'), updateMyTenant);

// Only superadmins can manage other tenants
router.use(restrictTo('superadmin'));

router.get('/all', getAllTenants);
router.post('/create-with-admin', createTenantWithAdmin);
router.put('/:id', updateTenant);

export default router;
