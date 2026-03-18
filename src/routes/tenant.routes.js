import express from 'express';
import { createTenantWithAdmin, getAllTenants } from '../controllers/tenant.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';

const router = express.Router();

// Only superadmins can manage tenants
router.use(protect);
router.use(restrictTo('superadmin'));

router.get('/all', getAllTenants);
router.post('/create-with-admin', createTenantWithAdmin);

export default router;
