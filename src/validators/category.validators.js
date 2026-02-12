import { body } from 'express-validator';

export const createCategoryValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Category name is required')
    .isLength({ max: 50 }).withMessage('Category name cannot exceed 50 characters'),
  body('type')
    .notEmpty().withMessage('Category type is required')
    .isIn(['income', 'expense']).withMessage('Type must be income or expense'),
  body('icon')
    .optional()
    .trim()
    .isString().withMessage('Icon must be a string'),
  body('color')
    .optional()
    .trim()
    .matches(/^#[0-9a-fA-F]{6}$/).withMessage('Color must be a valid hex color'),
];

export const updateCategoryValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Category name cannot exceed 50 characters'),
  body('type')
    .optional()
    .isIn(['income', 'expense']).withMessage('Type must be income or expense'),
  body('icon')
    .optional()
    .trim()
    .isString().withMessage('Icon must be a string'),
  body('color')
    .optional()
    .trim()
    .matches(/^#[0-9a-fA-F]{6}$/).withMessage('Color must be a valid hex color'),
];
