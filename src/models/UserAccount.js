import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userAccountSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
  },
  passwordHash: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false,
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [150, 'Name cannot exceed 150 characters'],
  },
  documentoIdentidad: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  role: {
    type: String,
    enum: ['user', 'superadmin'],
    default: 'user',
  },
  lastLogin: Date,
  profileImage: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
});

// Hash password before saving
userAccountSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) {
    return next();
  }
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

// Compare password method
userAccountSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Remove sensitive data from JSON
userAccountSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

userAccountSchema.index({ status: 1 });

const UserAccount = mongoose.model('UserAccount', userAccountSchema);

export default UserAccount;
