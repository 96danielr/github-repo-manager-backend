import { z } from 'zod';

export const registerValidation = z.object({
  body: z.object({
    name: z.string({ required_error: 'Name is required' })
      .trim()
      .min(2, 'Name must be between 2 and 50 characters')
      .max(50, 'Name must be between 2 and 50 characters'),
      
    email: z.string({ required_error: 'Email is required' })
      .trim()
      .email('Please provide a valid email')
      .toLowerCase(),
      
    password: z.string({ required_error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-z]/, 'Password must contain a lowercase letter')
      .regex(/[A-Z]/, 'Password must contain an uppercase letter')
      .regex(/[0-9]/, 'Password must contain a number'),
      
    confirmPassword: z.string({ required_error: 'Please confirm your password' })
  }).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  })
});

export const loginValidation = z.object({
  body: z.object({
    email: z.string({ required_error: 'Email is required' })
      .trim()
      .email('Please provide a valid email')
      .toLowerCase(),
      
    password: z.string({ required_error: 'Password is required' })
      .min(1, 'Password is required'), // Ensures it is not empty
  })
});
