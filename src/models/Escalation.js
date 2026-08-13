import mongoose from 'mongoose';

const escalationSchema = new mongoose.Schema({
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
    index: true,
  },
  callLog: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CallLog',
  },
  motivo: {
    type: String,
    trim: true,
  },
  estado: {
    type: String,
    enum: {
      values: ['pendiente', 'en_proceso', 'resuelto'],
      message: 'Estado no válido',
    },
    default: 'pendiente',
  },
}, {
  timestamps: true,
});

escalationSchema.index({ tenantId: 1, companyId: 1, estado: 1, createdAt: -1 });

escalationSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

const Escalation = mongoose.model('Escalation', escalationSchema);

export default Escalation;
