import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false,
  },
  github: {
    id: String,
    username: String,
    accessToken: String,
    avatar: String,
    profileUrl: String,
    name: String,
    bio: String,
    publicRepos: Number,
    followers: Number,
    following: Number,
    connectedAt: Date,
  },
  favorites: [{
    repoId: { type: Number, required: true },
    repoName: { type: String, required: true },
    repoFullName: { type: String, required: true },
    repoUrl: { type: String, required: true },
    description: String,
    language: String,
    stargazersCount: Number,
    forksCount: Number,
    addedAt: { type: Date, default: Date.now },
  }],
  refreshToken: {
    type: String,
    select: false,
  },
  lastLogin: Date,
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Index for faster queries (email index already created by unique: true)
userSchema.index({ 'github.id': 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove sensitive data from JSON
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  delete obj.__v;
  if (obj.github) {
    delete obj.github.accessToken;
  }
  return obj;
};

const User = mongoose.model('User', userSchema);

export default User;
