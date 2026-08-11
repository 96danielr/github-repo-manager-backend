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
  paymentMethod: String,
  paymentDate: Date,
  paymentObservations: String,
  amountPaid: Number,
  receiptUrl: String,
  receiptNumber: { type: Number, index: true },
  excelRowId: Number,
}, { timestamps: true });

quotaSchema.index({ tenantId: 1, companyId: 1 });
quotaSchema.index({ contract: 1 });
quotaSchema.index({ status: 1 });
quotaSchema.index({ dueDate: 1 });
quotaSchema.index({ companyId: 1, status: 1, dueDate: 1 });
quotaSchema.index({ companyId: 1, receiptNumber: 1 });

export default mongoose.model('Quota', quotaSchema);
