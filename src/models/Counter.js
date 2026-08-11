import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
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
  type: {
    type: String,
    required: true,
    default: 'RECEIPT',
  },
  seq: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

counterSchema.index({ companyId: 1, type: 1 }, { unique: true });

/**
 * Genera e incrementa atómicamente el siguiente consecutivo para un tipo/compañía
 * @param {ObjectId|string} companyId 
 * @param {ObjectId|string} tenantId 
 * @param {string} type 
 * @returns {Promise<number>} El nuevo número consecutivo (entero 1, 2, 3...)
 */
export async function getNextSequence(companyId, tenantId, type = 'RECEIPT') {
  const counter = await mongoose.model('Counter').findOneAndUpdate(
    { companyId, type },
    { 
      $inc: { seq: 1 },
      $setOnInsert: { tenantId }
    },
    { new: true, upsert: true }
  );
  return counter.seq;
}

export default mongoose.model('Counter', counterSchema);
