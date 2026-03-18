import express from 'express';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  changeUserPassword,
} from '../controllers/admin.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const router = express.Router();

// All admin-user routes require auth + tenant context + tenant_admin role
router.use(protect);
router.use(tenantMiddleware);
router.use(restrictTo('tenant_admin'));

router.get('/all', getAllUsers);
router.post('/create', createUser);
router.put('/update/:id', updateUser);
router.put('/change-password/:id', changeUserPassword);
router.delete('/delete/:id', deleteUser);

export default router;
