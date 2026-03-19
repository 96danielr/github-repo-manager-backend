import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
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
  contractId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract',
    required: true,
    index: true,
  },
  cuotaNumber: {
    type: Number,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  banco: {
    type: String,
    required: true,
  },
  fechaPago: {
    type: Date,
    required: true,
  },
  comprobante: {
    type: String, // URL or file path
  },
  status: {
    type: String,
    enum: ['PENDIENTE', 'APROBADO', 'RECHAZADO'],
    default: 'PENDIENTE',
    index: true,
  },
  observacion: {
    type: String,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: {
    type: Date,
  },
}, { timestamps: true });

// Index for filtering
paymentSchema.index({ tenantId: 1, companyId: 1, status: 1 });

export default mongoose.model('Payment', paymentSchema);
