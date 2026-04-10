import mongoose from 'mongoose';

/**
 * Bank model — Global listing for all companies/tenants.
 * Managed by superadmins for universal bank information.
 * Acronym (SIGLA) is the unique identifier and will be used in UI selectors.
 */
const bankSchema = new mongoose.Schema({
  type: {
    type: String,
    trim: true,
    required: true,
  },
  code: {
    type: String,
    trim: true,
    required: true,
  },
  competentDelegation: {
    type: String,
    trim: true,
  },
  socialDenomination: {
    type: String,
    trim: true,
    required: true,
  },
  acronym: {
    type: String,
    trim: true,
    required: true,
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true,
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    index: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

// Index for performance
bankSchema.index({ socialDenomination: 1 });
bankSchema.index({ tenantId: 1, companyId: 1, acronym: 1 }, { unique: true, partialFilterExpression: { tenantId: { $exists: true } } });

export default mongoose.model('Bank', bankSchema);
