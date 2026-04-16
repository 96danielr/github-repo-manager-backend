import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserAccount',
    required: true,
  },
  userFullName: {
    type: String,
    required: true,
  },
  userEmail: {
    type: String,
  },
  role: {
    type: String,
    required: true,
  },
  action: {
    type: String,
    required: true,
    index: true,
  },
  module: {
    type: String,
    required: true,
    index: true,
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
  },
  targetId: {
    type: String, // ID of the lot, payment, etc.
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
  },
  ip: {
    type: String,
  },
  userAgent: {
    type: String,
  }
}, {
  timestamps: true,
});

// Index for faster queries for Superadmin
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ tenantId: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
