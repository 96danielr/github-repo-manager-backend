import mongoose from 'mongoose';

/**
 * User = membership within a tenant.
 * A single UserAccount can have multiple User records (one per tenant).
 */
const userSchema = new mongoose.Schema({
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserAccount',
    required: [true, 'Account reference is required'],
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'Tenant reference is required'],
  },
  role: {
    type: String,
    enum: ['superadmin', 'tenant_admin', 'company_admin', 'agent', 'vendedor'],
    required: [true, 'Role is required'],
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, {
  timestamps: true,
});

// A single account can only have one membership per tenant
userSchema.index({ accountId: 1, tenantId: 1 }, { unique: true });
userSchema.index({ accountId: 1 });
userSchema.index({ tenantId: 1 });

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

const User = mongoose.model('User', userSchema);

export default User;
