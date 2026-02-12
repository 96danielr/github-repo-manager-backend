import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';
import AppError from '../utils/AppError.js';

export const getCategories = async (req, res, next) => {
  try {
    const filter = { user: req.user._id, isActive: true };
    if (req.query.type) {
      filter.type = req.query.type;
    }

    const categories = await Category.find(filter).sort({ type: 1, name: 1 });

    res.json({
      success: true,
      data: {
        categories,
        count: categories.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req, res, next) => {
  try {
    const { name, type, icon, color } = req.body;

    const category = await Category.create({
      name,
      type,
      icon,
      color,
      user: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: { category },
    });
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const category = await Category.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!category) {
      return next(new AppError('Category not found', 404));
    }

    const { name, type, icon, color } = req.body;
    if (name !== undefined) category.name = name;
    if (type !== undefined) category.type = type;
    if (icon !== undefined) category.icon = icon;
    if (color !== undefined) category.color = color;

    await category.save();

    res.json({
      success: true,
      data: { category },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!category) {
      return next(new AppError('Category not found', 404));
    }

    const transactionCount = await Transaction.countDocuments({
      category: category._id,
      user: req.user._id,
    });

    if (transactionCount > 0) {
      return next(new AppError(
        `No se puede eliminar la categoría con ${transactionCount} transacciones. Reasígnalas primero.`,
        400
      ));
    }

    category.isActive = false;
    await category.save();

    res.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
