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
import { protect } from '../middleware/auth.js';

const router = Router();

router.use(protect);

// Summary must come before /:id to avoid matching "summary" as an ID
router.get('/summary', validate(summaryQueryValidation), getSummary);
router.get('/', getTransactions);
router.get('/:id', getTransaction);
router.post('/', validate(createTransactionValidation), createTransaction);
router.put('/:id', validate(updateTransactionValidation), updateTransaction);
router.delete('/:id', deleteTransaction);

export default router;
