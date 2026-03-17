import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema({
  name: { 
    type: String, 
    trim: true,
    default: 'Cliente sin nombre',
  }, // Full Name of the client
  idNumber: { 
    type: String, 
    trim: true,
  }, // ID Number of the client
  phone: {
    type: String,
    trim: true,
  }, // Phone Number of the client
  behavior: {
    type: String,
    trim: true,
  }, // Behavior of the client, example: 'DISPUESTO' | 'INDECISO' | 'EVASIVO'
  excelRowId: Number,
}, { timestamps: true });

export default mongoose.model('Client', clientSchema);
