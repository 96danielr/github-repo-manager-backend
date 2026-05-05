import mongoose from 'mongoose';

const usageSchema = new mongoose.Schema({
  targetType: {
    type: String,
    enum: ['tenant', 'company', 'user'],
    required: true,
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  feature: {
    type: String,
    required: true,
  },
  periodType: {
    type: String,
    enum: ['daily', 'monthly', 'total'],
    required: true,
  },
  periodValue: {
    type: String,
    required: true, // e.g. "2024-04" for monthly, "2024-04-27" for daily, "forever" for total
  },
  count: {
    type: Number,
    default: 0,
  }
}, {
  timestamps: true,
});

// Index for fast lookup and unique constraints
usageSchema.index({ targetType: 1, targetId: 1, feature: 1, periodType: 1, periodValue: 1 }, { unique: true });

const Usage = mongoose.model('Usage', usageSchema);

export default Usage;
