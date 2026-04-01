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
