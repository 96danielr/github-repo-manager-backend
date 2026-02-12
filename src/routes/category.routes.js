import { Router } from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/category.controller.js';
import {
  createCategoryValidation,
  updateCategoryValidation,
} from '../validators/category.validators.js';
import validate from '../middleware/validate.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.use(protect);

router.get('/', getCategories);
router.post('/', createCategoryValidation, validate, createCategory);
router.put('/:id', updateCategoryValidation, validate, updateCategory);
router.delete('/:id', deleteCategory);

export default router;
