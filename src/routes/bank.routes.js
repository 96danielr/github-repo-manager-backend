import express from 'express';
import { 
  getBanks, 
  createBank, 
  updateBank, 
  deleteBank, 
  bulkCreateBanks,
  importBanksExcel,
} from '../controllers/bank.controller.js';
import multer from 'multer';
import { protect, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { companyMiddleware } from '../middleware/company.js';

const router = express.Router();

// Publicly accessible bank listing (context resolved inside controller via query params)
router.get('/', getBanks);

// Management routes
router.use(protect, tenantMiddleware, companyMiddleware);

const upload = multer({ storage: multer.memoryStorage() });

router.post('/', checkPermission(PERMISSIONS.BANCOS_MANAGE), createBank);
router.post('/bulk', checkPermission(PERMISSIONS.BANCOS_MANAGE), bulkCreateBanks);
router.post('/import', checkPermission(PERMISSIONS.BANCOS_MANAGE), upload.single('file'), importBanksExcel);
router.put('/:id', checkPermission(PERMISSIONS.BANCOS_MANAGE), updateBank);
router.delete('/:id', checkPermission(PERMISSIONS.BANCOS_DELETE), deleteBank);

export default router;
