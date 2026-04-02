import mongoose from 'mongoose';

const userCompanySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
  },
  role: {
    type: String,
    enum: ['company_admin', 'agent', 'vendedor'],
    required: true,
  },
}, {
  timestamps: true,
});

// Unique: a user can only have one role per company
userCompanySchema.index({ userId: 1, companyId: 1 }, { unique: true });
userCompanySchema.index({ userId: 1 });
userCompanySchema.index({ tenantId: 1 });

userCompanySchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

const UserCompany = mongoose.model('UserCompany', userCompanySchema);

export default UserCompany;
