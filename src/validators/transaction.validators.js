import { z } from 'zod';

const isoDate = z.string().refine(val => !isNaN(Date.parse(val)), { message: 'Date must be a valid date' });

export const createTransactionValidation = z.object({
  body: z.object({
    type: z.enum(['income', 'expense'], { required_error: 'Transaction type is required', invalid_type_error: 'Type must be income or expense' }),
    amount: z.coerce.number({ required_error: 'Amount is required' }).min(0.01, 'Amount must be greater than 0'),     
    description: z.string({ required_error: 'Description is required' }).trim().min(1, 'Description is required').max(200, 'Description cannot exceed 200 characters'),
    category: z.string({ required_error: 'Category is required' }).regex(/^[0-9a-fA-F]{24}$/, 'Invalid category ID'),
    date: isoDate.optional(),
    notes: z.string().trim().max(500, 'Notes cannot exceed 500 characters').optional(),
  })
});

export const updateTransactionValidation = z.object({
  body: z.object({
    type: z.enum(['income', 'expense'], { invalid_type_error: 'Type must be income or expense' }).optional(),
    amount: z.coerce.number().min(0.01, 'Amount must be greater than 0').optional(),     
    description: z.string().trim().max(200, 'Description cannot exceed 200 characters').optional(),
    category: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid category ID').optional(),
    date: isoDate.optional(),
    notes: z.string().trim().max(500, 'Notes cannot exceed 500 characters').optional(),
  })
});

export const summaryQueryValidation = z.object({
  query: z.object({
    month: z.coerce.number().min(1, 'Month must be between 1 and 12').max(12, 'Month must be between 1 and 12').optional(),
    year: z.coerce.number().min(2020, 'Year must be between 2020 and 2100').max(2100, 'Year must be between 2020 and 2100').optional(),
  })
});
