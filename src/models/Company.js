import mongoose from 'mongoose';

const companySchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'Tenant is required'],
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    maxlength: [150, 'Name cannot exceed 150 characters'],
  },
  slug: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
  },
  rfc: {
    type: String,
    trim: true,
    maxlength: [20, 'RFC cannot exceed 20 characters'],
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
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
  bankInfo: {
    banco: String,
    tipoCuenta: String,
    numeroCuenta: String,
  },
  integrations: {
    whatsappEnabled: { type: Boolean, default: false },
    whatsappApiKey: String,
    whatsappWabaId: String,
    whatsappPhoneId: String,
    whatsappAccessToken: String,
    whatsappDisplayPhone: String,
    whatsappVerifiedName: String,
    whatsappConnectedAt: Date,
    daptaEnabled: { type: Boolean, default: false },
    daptaApiKey: String,
  },
}, {
  timestamps: true,
});

companySchema.index({ tenantId: 1, status: 1 });

companySchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

const Company = mongoose.model('Company', companySchema);

export default Company;
