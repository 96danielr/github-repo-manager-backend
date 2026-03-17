import mongoose from 'mongoose';

const quotaSchema = new mongoose.Schema({
  contract: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Contract', 
    required: true 
  }, // Contract ID (Reference to Contract model)
  number: Number,
  type: { 
    type: String, 
    enum: ['inicial', 'normal'], 
    default: 'normal' 
  }, // Type of the quota example 'inicial' or 'normal'
  value: Number, // Value of the quota
  dueDate: Date, // Due date of the quota
  status: { 
    type: String, 
    enum: ['pendiente', 'pagado', 'mora'], 
    default: 'pendiente' 
  }, // Status of the quota example 'pendiente' or 'pagado' or 'mora'
  excelRowId: Number,
}, { timestamps: true });

export default mongoose.model('Quota', quotaSchema);
