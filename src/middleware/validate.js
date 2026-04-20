import { ZodError } from 'zod';

const validate = (schema) => (req, res, next) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    next();
  } catch (error) {
    const isZodError = error.name === 'ZodError' || error instanceof ZodError;
    if (isZodError && (error.errors || error.issues)) {
      const issues = error.errors || error.issues;
      const messages = issues.map((err) => `${err.path ? err.path.join('.') + ': ' : ''}${err.message}`);
      return res.status(400).json({
        success: false,
        message: messages[0],
        errors: messages,
      });
    }
    console.error('Validation unexpected error:', error);
    next(error);
  }
};

export default validate;
