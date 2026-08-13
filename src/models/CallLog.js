import mongoose from 'mongoose';

const callLogSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true,
  },
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
  conversationId: {
    type: String,
    unique: true,
    sparse: true,
  },
  intent: {
    type: String,
    enum: {
      values: ['cobro', 'recordatorio', 'dudas', 'soporte', 'general'],
      message: 'Intención no válida',
    },
    default: 'general',
  },
  durationSeconds: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: {
      values: ['completed', 'failed', 'cancelled', 'in_progress'],
      message: 'Estado no válido',
    },
    default: 'in_progress',
  },
  transcript: [
    {
      role: {
        type: String,
        enum: ['agent', 'user'],
      },
      message: String,
      timestamp: Date,
    },
  ],
  paymentPromise: {
    promisedDate: Date,
    amount: Number,
    notes: String,
  },
  escalated: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

callLogSchema.index({ tenantId: 1, companyId: 1, createdAt: -1 });
callLogSchema.index({ client: 1, createdAt: -1 });

callLogSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

const CallLog = mongoose.model('CallLog', callLogSchema);

export default CallLog;
