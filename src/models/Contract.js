import mongoose from 'mongoose';

const contractSchema = new mongoose.Schema({
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
  client: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Client', 
    required: true,
  },
  lot: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Lot', 
    required: true,
  },
  contractDate: Date,
  negotiation: String, 
  appendix: String,
  totalValue: Number,
  installmentsCount: Number,
  installmentValue: Number,
  paymentDay: Number,
  startDate: Date,
  bonus: String,
  bonusValue: Number,
  commercial: String,
  recaudadoSiigo2024: { type: Number, default: 0 },
  recaudadoSiigo2025: { type: Number, default: 0 },
  juridicalRequirement: String,
  observations: String,
  excelRowId: Number,
}, { timestamps: true });

contractSchema.index({ tenantId: 1, companyId: 1 });

export default mongoose.model('Contract', contractSchema);
