import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema({
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
    trim: true,
    default: 'Cliente sin nombre',
  },
  idNumber: { 
    type: String, 
    trim: true,
  },
  phone: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  behavior: {
    type: String,
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  excelRowId: Number,
}, { timestamps: true });

clientSchema.index({ tenantId: 1, companyId: 1 });
clientSchema.index({ companyId: 1, idNumber: 1 });
clientSchema.index({ name: 'text' });

export default mongoose.model('Client', clientSchema);
