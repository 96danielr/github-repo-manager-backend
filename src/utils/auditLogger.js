import AuditLog from '../models/AuditLog.js';

/**
 * Utility to log critical operations in the system
 * @param {Object} req - Express request object
 * @param {Object} options - Log options
 * @param {String} options.action - Action name (e.g. 'SALE_LOT')
 * @param {String} options.module - Module name (e.g. 'LOTS')
 * @param {String} options.targetId - ID of the affected resource
 * @param {Object} options.details - Additional details
 */
export const logAudit = async (req, { action, module, targetId, details }) => {
  try {
    if (!req.user) return;

    await AuditLog.create({
      userId: req.user.accountId || req.user._id,
      userFullName: req.user.fullName || 'Unknown',
      userEmail: req.user.email,
      role: req.user.role,
      action,
      module,
      tenantId: req.user.tenantId,
      companyId: req.user.companyId,
      targetId,
      details,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
  } catch (error) {
    console.error('Audit Log Error:', error);
  }
};
