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
  nomenclature: {
    type: String,
    trim: true,
  },
  lotNumber: {
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
    enum: ['disponible', 'vendido'],
    default: 'disponible',
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  excelRowId: Number,
}, { timestamps: true });

lotSchema.index({ tenantId: 1, companyId: 1 });

export default mongoose.model('Lot', lotSchema);
