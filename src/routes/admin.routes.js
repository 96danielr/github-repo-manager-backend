import express from 'express';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  changeUserPassword,
  getSellers,
} from '../controllers/admin.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const router = express.Router();

// All admin-user routes require auth + tenant context + tenant_admin role
router.use(protect);
router.use(tenantMiddleware);
router.get('/all', restrictTo('superadmin', 'tenant_admin'), getAllUsers);
router.get('/sellers', restrictTo('superadmin', 'tenant_admin', 'company_admin'), getSellers);
router.post('/create', restrictTo('superadmin', 'tenant_admin'), createUser);
router.put('/update/:id', restrictTo('superadmin', 'tenant_admin'), updateUser);
router.put('/change-password/:id', restrictTo('superadmin', 'tenant_admin'), changeUserPassword);
router.delete('/delete/:id', restrictTo('superadmin', 'tenant_admin'), deleteUser);

export default router;
