import Bonus from '../models/Bonus.js';
import AppError from '../utils/AppError.js';

// Get all bonuses for a company
export const getBonuses = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;
    const filter = { tenantId, companyId };
    
    // Allow optional filtering by active status
    if (req.query.activeOnly === 'true') {
      filter.isActive = true;
    }

    const bonuses = await Bonus.find(filter).sort({ name: 1 });

    res.json({
      success: true,
      data: {
        bonuses,
        count: bonuses.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Create a new bonus
export const createBonus = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;
    const { name, value, description, isActive } = req.body;

    if (!name || value === undefined) {
      return next(new AppError('El nombre y el valor del bono son obligatorios', 400));
    }

    const bonus = await Bonus.create({
      tenantId,
      companyId,
      name,
      value: parseFloat(value),
      description,
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json({
      success: true,
      data: { bonus },
    });
  } catch (error) {
    next(error);
  }
};

// Update an existing bonus
export const updateBonus = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;
    const { id } = req.params;

    const bonus = await Bonus.findOne({ _id: id, tenantId, companyId });
    if (!bonus) {
      return next(new AppError('Bono no encontrado', 404));
    }

    const { name, value, description, isActive } = req.body;

    if (name !== undefined) bonus.name = name;
    if (value !== undefined) bonus.value = parseFloat(value);
    if (description !== undefined) bonus.description = description;
    if (isActive !== undefined) bonus.isActive = isActive;

    await bonus.save();

    res.json({
      success: true,
      data: { bonus },
    });
  } catch (error) {
    next(error);
  }
};

// Delete (deactivate) a bonus
export const deleteBonus = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;
    const { id } = req.params;

    const bonus = await Bonus.findOne({ _id: id, tenantId, companyId });
    if (!bonus) {
      return next(new AppError('Bono no encontrado', 404));
    }

    // Soft delete by setting isActive to false
    bonus.isActive = false;
    await bonus.save();

    res.json({
      success: true,
      message: 'Bono desactivado exitosamente',
    });
  } catch (error) {
    next(error);
  }
};
