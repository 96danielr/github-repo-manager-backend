import mongoose from 'mongoose';

const lotSchema = new mongoose.Schema({
  stage: {
    type: String,
    trim: true
  }, // Stage of the lot example 'ETAPA 1'
  nomenclature: {
    type: String,
    trim: true
  }, // Nomenclature of the lot example '42'
  lotNumber: {
    type: String,
    trim: true
  }, // Lot number example '275-2'
  area: {
    type: Number
  }, // Area of the lot example '120' on m2
  excelRowId: Number,
}, { timestamps: true });

export default mongoose.model('Lot', lotSchema);
