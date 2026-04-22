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
import { protect, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = Router();

router.use(protect);
router.use(checkPermission(PERMISSIONS.CATEGORIES_MANAGE));

router.get('/', getCategories);
router.post('/', validate(createCategoryValidation), createCategory);
router.put('/:id', validate(updateCategoryValidation), updateCategory);
router.delete('/:id', deleteCategory);

export default router;
