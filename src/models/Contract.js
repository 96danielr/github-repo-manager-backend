import mongoose from 'mongoose';

const contractSchema = new mongoose.Schema({
  client: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Client', 
    required: true 
  }, // Client ID (Reference to Client model)
  lot: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Lot', 
    required: true 
  }, // Lot ID (Reference to Lot model)
  contractDate: Date, // Contract Date format iso ISO 8601
  negotiation: String, 
  appendix: String, // Otro si
  totalValue: Number, // Total value of the contract
  installmentsCount: Number, // Number of installments
  installmentValue: Number, // Value of each installment
  paymentDay: Number, // Payment day of the month
  startDate: Date, // Start date of the contract
  bonus: String,
  bonusValue: Number,
  commercial: String,
  recaudadoSiigo2024: { type: Number, default: 0 },
  recaudadoSiigo2025: { type: Number, default: 0 },
  juridicalRequirement: String,
  observations: String,
  excelRowId: Number,
}, { timestamps: true });

export default mongoose.model('Contract', contractSchema);
