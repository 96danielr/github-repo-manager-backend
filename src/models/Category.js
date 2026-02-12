import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    maxlength: [50, 'Category name cannot exceed 50 characters'],
  },
  type: {
    type: String,
    required: [true, 'Category type is required'],
    enum: {
      values: ['income', 'expense'],
      message: 'Type must be either income or expense',
    },
  },
  icon: {
    type: String,
    default: 'Circle',
  },
  color: {
    type: String,
    default: '#8b949e',
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Category must belong to a user'],
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

categorySchema.index({ user: 1, type: 1 });
categorySchema.index({ user: 1, name: 1, type: 1 }, { unique: true });

categorySchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

const Category = mongoose.model('Category', categorySchema);

export default Category;
