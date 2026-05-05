import mongoose from 'mongoose';

const limitSchema = new mongoose.Schema({
  targetType: {
    type: String,
    enum: ['tenant', 'company', 'user'],
    required: true,
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    // Note: ref is dynamic based on targetType, 
    // but Mongoose doesn't strictly require ref for basic usage
  },
  feature: {
    type: String,
    required: true,
    enum: ['ai_chat'], // Add more features as needed
  },
  limit: {
    type: Number,
    required: true,
    min: 0,
  },
  period: {
    type: String,
    enum: ['daily', 'monthly', 'total'],
    default: 'monthly',
  },
  active: {
    type: Boolean,
    default: true,
  }
}, {
  timestamps: true,
});

// Unique index to prevent duplicate limits for same target/feature/period
limitSchema.index({ targetType: 1, targetId: 1, feature: 1, period: 1 }, { unique: true });

const Limit = mongoose.model('Limit', limitSchema);

export default Limit;
