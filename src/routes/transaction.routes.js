import { Router } from 'express';
import {
  getTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getSummary,
} from '../controllers/transaction.controller.js';
import {
  createTransactionValidation,
  updateTransactionValidation,
  summaryQueryValidation,
} from '../validators/transaction.validators.js';
import validate from '../middleware/validate.js';
import { protect, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = Router();

router.use(protect);
router.use(checkPermission(PERMISSIONS.TRANSACCIONES_VIEW));

// Summary must come before /:id to avoid matching "summary" as an ID
router.get('/summary', validate(summaryQueryValidation), getSummary);
router.get('/', getTransactions);
router.get('/:id', getTransaction);
router.post('/', validate(createTransactionValidation), createTransaction);
router.put('/:id', validate(updateTransactionValidation), updateTransaction);
router.delete('/:id', deleteTransaction);

export default router;
