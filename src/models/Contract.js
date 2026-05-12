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
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  contractDate: Date,
  negotiation: String, 
  appendix: String,
  totalValue: Number,
  initialQuotaPercentage: Number,
  initialQuotasCount: Number,
  installmentsCount: Number,
  installmentValue: Number,
  paymentDay: Number,
  startDate: Date,
  bonus: String,
  bonusValue: Number,
  commercial: String,
  recaudadoSiigo2024: { type: Number, default: 0 },
  recaudadoSiigo2025: { type: Number, default: 0 },
  revisadoPor: String,
  juridicalRequirement: String,
  observations: String,
  excelRowId: Number,
  status: { type: String, default: 'ACTIVO' }, // Possible values: FIRMADO, PENDIENTE, DISPONIBLE, etc.
}, { timestamps: true });

contractSchema.index({ tenantId: 1, companyId: 1 });
contractSchema.index({ client: 1 });
contractSchema.index({ lot: 1 });
contractSchema.index({ sellerId: 1 });
contractSchema.index({ status: 1 });

export default mongoose.model('Contract', contractSchema);
