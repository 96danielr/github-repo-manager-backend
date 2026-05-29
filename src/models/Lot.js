import mongoose from 'mongoose';

const lotSchema = new mongoose.Schema({
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
  stage: {
    type: String,
    trim: true,
  },
  manzana: {
    type: String,
    trim: true,
  },
  nomenclature: {
    type: String,
    trim: true,
  },
  lotNumber: {
    type: String,
    trim: true,
  },
  reference: {
    type: String,
    trim: true,
  },
  area: {
    type: Number,
  },
  price: {
    type: Number,
  },
  images: [{
    type: String,
  }],
  status: {
    type: String,
    enum: ['disponible', 'apartado', 'separado', 'vendido'],
    default: 'disponible',
  },
  maxInstallments: {
    type: Number,
    default: 24,
  },
  reservedAt: Date,
  expiresAt: Date,
  reservationBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
  },

  reservationDetails: {
    type: String,
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  excelRowId: Number,
}, { timestamps: true });

lotSchema.index({ tenantId: 1, companyId: 1 });
lotSchema.index({ status: 1 });
lotSchema.index({ reference: 1 });
lotSchema.index({ sellerId: 1 });
lotSchema.index({ companyId: 1, status: 1 });

export default mongoose.model('Lot', lotSchema);
