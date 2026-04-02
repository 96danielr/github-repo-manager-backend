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
    unique: true, // Acronym (SIGLA) is the unique identifier for UI and business logic
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

// Index for performance
bankSchema.index({ socialDenomination: 1 });

export default mongoose.model('Bank', bankSchema);
