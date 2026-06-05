import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tenant name is required'],
    trim: true,
    maxlength: [150, 'Name cannot exceed 150 characters'],
  },
  plan: {
    type: String,
    enum: ['basic', 'premium', 'enterprise'],
    default: 'basic',
  },
  subscriptionStart: {
    type: Date,
    default: Date.now,
  },
  subscriptionEnd: {
    type: Date,
  },
  activeModules: {
    type: [String],
    default: ['cobranzas'],
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'trial'],
    default: 'trial',
  },
  nit: {
    type: String,
    trim: true,
  },
  address: {
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
}, {
  timestamps: true,
});

tenantSchema.index({ status: 1 });

tenantSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

const Tenant = mongoose.model('Tenant', tenantSchema);

export default Tenant;
