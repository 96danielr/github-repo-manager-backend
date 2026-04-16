import express from 'express';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  changeUserPassword,
  updateProfile,
  changeMyPassword,
  uploadProfileImage,
  getSellers,
  getSystemLogs,
} from '../controllers/admin.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import upload from '../middleware/upload.js';

const router = express.Router();

// All admin-user routes require auth + tenant context
router.use(protect);
router.use(tenantMiddleware);

// Superadmin only
router.get('/logs', restrictTo('superadmin'), getSystemLogs);

// Other admin routes
router.get('/all', restrictTo('superadmin', 'tenant_admin'), getAllUsers);
router.get('/sellers', restrictTo('superadmin', 'tenant_admin', 'company_admin'), getSellers);
router.post('/create', restrictTo('superadmin', 'tenant_admin'), createUser);
router.put('/update/:id', restrictTo('superadmin', 'tenant_admin'), updateUser);
router.put('/change-password/:id', restrictTo('superadmin', 'tenant_admin'), changeUserPassword);
router.delete('/delete/:id', restrictTo('superadmin', 'tenant_admin'), deleteUser);

// Profile routes (any authenticated user can update their own profile)
router.put('/profile', updateProfile);
router.put('/change-my-password', changeMyPassword);
router.put('/upload-photo', upload.single('image'), uploadProfileImage);

export default router;
