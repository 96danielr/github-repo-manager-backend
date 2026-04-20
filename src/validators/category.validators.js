import { z } from 'zod';

export const createCategoryValidation = z.object({
  body: z.object({
    name: z.string({ required_error: 'Category name is required' })
      .trim()
      .min(1, 'Category name is required')
      .max(50, 'Category name cannot exceed 50 characters'),
      
    type: z.enum(['income', 'expense'], { 
      required_error: 'Category type is required', 
      invalid_type_error: 'Type must be income or expense' 
    }),
    
    icon: z.string({ invalid_type_error: 'Icon must be a string' })
      .trim()
      .optional(),
      
    color: z.string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex color')
      .optional()
  })
});

export const updateCategoryValidation = z.object({
  body: z.object({
    name: z.string()
      .trim()
      .max(50, 'Category name cannot exceed 50 characters')
      .optional(),
      
    type: z.enum(['income', 'expense'], { 
      invalid_type_error: 'Type must be income or expense' 
    }).optional(),
    
    icon: z.string({ invalid_type_error: 'Icon must be a string' })
      .trim()
      .optional(),
      
    color: z.string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex color')
      .optional()
  })
});
