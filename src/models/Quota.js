import mongoose from 'mongoose';

const quotaSchema = new mongoose.Schema({
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
  contract: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Contract', 
    required: true,
  },
  number: Number,
  type: { 
    type: String, 
    enum: ['inicial', 'normal'], 
    default: 'normal',
  },
  value: Number,
  dueDate: Date,
  status: { 
    type: String, 
    enum: ['pendiente', 'pagado', 'mora'], 
    default: 'pendiente',
  },
  paymentCapture: String,
  paymentBank: String,
  paymentDate: Date,
  paymentObservations: String,
  amountPaid: Number,
  receiptUrl: String,
  excelRowId: Number,
}, { timestamps: true });

quotaSchema.index({ tenantId: 1, companyId: 1 });

export default mongoose.model('Quota', quotaSchema);
