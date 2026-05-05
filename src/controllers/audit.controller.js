import AuditLog from '../models/AuditLog.js';
import mongoose from 'mongoose';

/**
 * Get audit logs for the current company/tenant
 * Restricted to admins
 */
export const getAuditLogs = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;
    const { 
      page = 1, 
      limit = 20, 
      module, 
      action, 
      userId,
      startDate,
      endDate 
    } = req.query;

    const skip = (page - 1) * limit;

    const query = { 
      tenantId: new mongoose.Types.ObjectId(tenantId)
    };

    // If companyId is provided (standard for tenant_admin), filter by it
    if (companyId) {
      query.companyId = new mongoose.Types.ObjectId(companyId);
    }

    if (module) query.module = module;
    if (action) query.action = action;
    if (userId) query.userId = new mongoose.Types.ObjectId(userId);

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await AuditLog.countDocuments(query);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get available modules and actions for filtering
 */
export const getAuditMetadata = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    
    const modules = await AuditLog.distinct('module', { tenantId });
    const actions = await AuditLog.distinct('action', { tenantId });

    res.status(200).json({
      success: true,
      data: {
        modules,
        actions
      }
    });
  } catch (error) {
    next(error);
  }
};
