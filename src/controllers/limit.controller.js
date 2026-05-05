import Limit from '../models/Limit.js';
import Usage from '../models/Usage.js';
import { limitService } from '../services/limit.service.js';
import AppError from '../utils/AppError.js';

/**
 * Get all limits for the current context.
 * Superadmins see everything.
 * Tenant admins see their tenant limits and their companies/users limits.
 */
export const getLimits = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    const { targetId, targetType } = req.query;
    let query = {};

    if (role !== 'superadmin') {
      // Find all targetIds that belong to this tenant or are the tenant itself
      query = {
        $or: [
          { targetType: 'tenant', targetId: tenantId },
          { targetType: 'company', tenantId: tenantId },
          { targetType: 'user', tenantId: tenantId }
        ]
      };
    } else {
      // Superadmin can filter by any target if provided
      if (targetId) query.targetId = targetId;
      if (targetType) query.targetType = targetType;
    }

    const limits = await Limit.find(query);
    res.status(200).json({ success: true, data: limits });
  } catch (error) {
    next(error);
  }
};

/**
 * Create or update a limit.
 */
export const setLimit = async (req, res, next) => {
  try {
    const { targetType, targetId, feature, limit, period, active } = req.body;
    const { tenantId, role } = req.user;

    // Security check: Only superadmin can modify tenant-level limits
    if (role !== 'superadmin') {
      if (targetType === 'tenant') {
        return next(new AppError('No tienes permisos para modificar los límites del tenant. Contacta al soporte técnico.', 403));
      }

      // Security check: Verify targetId belongs to the user's tenant if they are a tenant_admin
      // (This applies when they try to set limits for their own users or companies)
      if (targetType === 'user' || targetType === 'company') {
        // TODO: Implement verification that targetId belongs to req.user.tenantId
        // For now, we block it to be safe until verification is implemented
        return next(new AppError('Funcionalidad de gestión de límites internos no disponible aún.', 403));
      }
    }

    const updatedLimit = await Limit.findOneAndUpdate(
      { targetType, targetId, feature, period },
      { limit, active: active !== undefined ? active : true },
      { upsert: true, new: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: updatedLimit });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current usage statistics.
 */
export const getUsageStats = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    const { feature, targetType, targetId } = req.query;

    let query = {};
    if (feature) query.feature = feature;
    if (targetType) query.targetType = targetType;
    if (targetId) query.targetId = targetId;

    if (role !== 'superadmin') {
       // Filter by tenant context
    }

    const usage = await Usage.find(query).sort({ updatedAt: -1 }).limit(100);
    res.status(200).json({ success: true, data: usage });
  } catch (error) {
    next(error);
  }
};
