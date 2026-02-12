import Transaction from '../models/Transaction.js';
import Category from '../models/Category.js';
import AppError from '../utils/AppError.js';

export const getTransactions = async (req, res, next) => {
  try {
    const { type, category, from, to, page = 1, limit = 20 } = req.query;
    const filter = { user: req.user._id };

    if (type) filter.type = type;
    if (category) filter.category = category;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate('category', 'name type icon color')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Transaction.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
          hasMore: skip + transactions.length < total,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).populate('category', 'name type icon color');

    if (!transaction) {
      return next(new AppError('Transaction not found', 404));
    }

    res.json({
      success: true,
      data: { transaction },
    });
  } catch (error) {
    next(error);
  }
};

export const createTransaction = async (req, res, next) => {
  try {
    const { type, amount, description, category, date, notes } = req.body;

    // Verify category belongs to user and matches type
    const categoryDoc = await Category.findOne({
      _id: category,
      user: req.user._id,
      isActive: true,
    });

    if (!categoryDoc) {
      return next(new AppError('Category not found', 404));
    }

    if (categoryDoc.type !== type) {
      return next(new AppError(
        `La categoría "${categoryDoc.name}" es de tipo "${categoryDoc.type}", pero la transacción es "${type}"`,
        400
      ));
    }

    const transaction = await Transaction.create({
      type,
      amount,
      description,
      category,
      date: date || new Date(),
      notes,
      user: req.user._id,
    });

    const populated = await transaction.populate('category', 'name type icon color');

    res.status(201).json({
      success: true,
      data: { transaction: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const updateTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!transaction) {
      return next(new AppError('Transaction not found', 404));
    }

    const { type, amount, description, category, date, notes } = req.body;

    if (category) {
      const categoryDoc = await Category.findOne({
        _id: category,
        user: req.user._id,
        isActive: true,
      });
      if (!categoryDoc) {
        return next(new AppError('Category not found', 404));
      }
      const effectiveType = type || transaction.type;
      if (categoryDoc.type !== effectiveType) {
        return next(new AppError('Category type does not match transaction type', 400));
      }
    }

    if (type !== undefined) transaction.type = type;
    if (amount !== undefined) transaction.amount = amount;
    if (description !== undefined) transaction.description = description;
    if (category !== undefined) transaction.category = category;
    if (date !== undefined) transaction.date = date;
    if (notes !== undefined) transaction.notes = notes;

    await transaction.save();
    const populated = await transaction.populate('category', 'name type icon color');

    res.json({
      success: true,
      data: { transaction: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!transaction) {
      return next(new AppError('Transaction not found', 404));
    }

    res.json({
      success: true,
      message: 'Transaction deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getSummary = async (req, res, next) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year = parseInt(req.query.year) || now.getFullYear();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const [summary, recentTransactions] = await Promise.all([
      Transaction.aggregate([
        {
          $match: {
            user: req.user._id,
            date: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $lookup: {
            from: 'categories',
            localField: 'category',
            foreignField: '_id',
            as: 'categoryInfo',
          },
        },
        { $unwind: '$categoryInfo' },
        {
          $group: {
            _id: {
              type: '$type',
              categoryId: '$category',
              categoryName: '$categoryInfo.name',
              categoryIcon: '$categoryInfo.icon',
              categoryColor: '$categoryInfo.color',
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),
      Transaction.find({
        user: req.user._id,
        date: { $gte: startDate, $lte: endDate },
      })
        .populate('category', 'name type icon color')
        .sort({ date: -1 })
        .limit(10),
    ]);

    let totalIncome = 0;
    let totalExpenses = 0;
    const incomeByCategory = [];
    const expenseByCategory = [];

    summary.forEach(item => {
      const entry = {
        categoryId: item._id.categoryId,
        categoryName: item._id.categoryName,
        categoryIcon: item._id.categoryIcon,
        categoryColor: item._id.categoryColor,
        total: item.total,
        count: item.count,
      };

      if (item._id.type === 'income') {
        totalIncome += item.total;
        incomeByCategory.push(entry);
      } else {
        totalExpenses += item.total;
        expenseByCategory.push(entry);
      }
    });

    res.json({
      success: true,
      data: {
        month,
        year,
        totalIncome,
        totalExpenses,
        balance: totalIncome - totalExpenses,
        incomeByCategory,
        expenseByCategory,
        recentTransactions,
      },
    });
  } catch (error) {
    next(error);
  }
};
