import mongoose from 'mongoose';

const bonusSchema = new mongoose.Schema({
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
    required: [true, 'El nombre del bono es obligatorio'],
    trim: true,
  },
  value: {
    type: Number,
    required: [true, 'El valor del bono es obligatorio'],
    min: [0, 'El valor del bono no puede ser negativo'],
  },
  description: {
    type: String,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

bonusSchema.index({ tenantId: 1, companyId: 1, isActive: 1 });

export default mongoose.model('Bonus', bonusSchema);
