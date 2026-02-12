import { body, query } from 'express-validator';

export const createTransactionValidation = [
  body('type')
    .notEmpty().withMessage('Transaction type is required')
    .isIn(['income', 'expense']).withMessage('Type must be income or expense'),
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ max: 200 }).withMessage('Description cannot exceed 200 characters'),
  body('category')
    .notEmpty().withMessage('Category is required')
    .isMongoId().withMessage('Invalid category ID'),
  body('date')
    .optional()
    .isISO8601().withMessage('Date must be a valid date'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters'),
];

export const updateTransactionValidation = [
  body('type')
    .optional()
    .isIn(['income', 'expense']).withMessage('Type must be income or expense'),
  body('amount')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Description cannot exceed 200 characters'),
  body('category')
    .optional()
    .isMongoId().withMessage('Invalid category ID'),
  body('date')
    .optional()
    .isISO8601().withMessage('Date must be a valid date'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters'),
];

export const summaryQueryValidation = [
  query('month')
    .optional()
    .isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  query('year')
    .optional()
    .isInt({ min: 2020, max: 2100 }).withMessage('Year must be between 2020 and 2100'),
];
