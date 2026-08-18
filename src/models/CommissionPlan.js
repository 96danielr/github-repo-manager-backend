import mongoose from 'mongoose';

const milestoneSchema = new mongoose.Schema({
  key: {
    type: String,
    enum: ['INITIAL_QUOTA', 'QUOTA_NUMBER'],
    required: [true, 'El tipo de hito es obligatorio'],
  },
  quotaNumber: Number,
  amount: Number,
  portion: Number,
}, { _id: false });

const tierSchema = new mongoose.Schema({
  initialQuotaPercentage: {
    type: Number,
    required: [true, 'El porcentaje de cuota inicial es obligatorio'],
    min: 1,
    max: 100,
  },
  milestones: [milestoneSchema],
}, { _id: false });

const commissionPlanSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'El nombre del plan es obligatorio'],
    trim: true,
  },
  baseType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: [true, 'El tipo de base es obligatorio'],
  },
  baseValue: {
    type: Number,
    required: [true, 'El valor base es obligatorio'],
    min: 0,
  },
  tiers: [tierSchema],
  milestones: [milestoneSchema],
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

commissionPlanSchema.index({ tenantId: 1, companyId: 1, isActive: 1 });

export default mongoose.model('CommissionPlan', commissionPlanSchema);
