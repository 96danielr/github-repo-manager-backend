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
import { protect, restrictTo } from '../middleware/auth.js';

const router = express.Router();

// All users can list banks
router.get('/', protect, getBanks);

// Only Super Admins can manage the global bank list
router.use(protect);
router.use(restrictTo('superadmin'));

const upload = multer({ storage: multer.memoryStorage() });

router.post('/', createBank);
router.post('/bulk', bulkCreateBanks);
router.post('/import', upload.single('file'), importBanksExcel);
router.put('/:id', updateBank);
router.delete('/:id', deleteBank);

export default router;
