import { limitService } from '../services/limit.service.js';
import AppError from '../utils/AppError.js';

/**
 * Middleware to check if a feature limit has been reached.
 * Should be used after protect, tenantMiddleware and optionally companyMiddleware.
 */
export const checkFeatureLimit = (feature) => {
  return async (req, res, next) => {
    try {
      const context = {
        userId: req.user.userId || req.user._id,
        companyId: req.user.companyId,
        tenantId: req.user.tenantId
      };

      const { allowed, reason } = await limitService.checkLimit(context, feature);

      if (!allowed) {
        return next(new AppError(reason, 429)); // 429 Too Many Requests
      }

      // We don't increment here because the action hasn't succeeded yet.
      // Usually we increment AFTER the successful operation or we provide a way to increment manually.
      // For AI chat, we'll increment in the controller or service after the request starts.
      
      next();
    } catch (error) {
      next(error);
    }
  };
};
