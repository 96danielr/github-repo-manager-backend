import Lot from '../models/Lot.js';
import { catchAsync } from '../utils/catchAsync.js';

export const createLot = catchAsync(async (req, res) => {
  const lot = await Lot.create(req.body);

  res.status(201).json({
    success: true,
    data: lot
  });
});

export const getLots = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, search } = req.query;
  const skip = (page - 1) * limit;

  let query = {};
  if (search) {
    query = {
      $or: [
        { stage: { $regex: search, $options: 'i' } },
        { nomenclature: { $regex: search, $options: 'i' } },
        { lotNumber: { $regex: search, $options: 'i' } }
      ]
    };
  }

  const total = await Lot.countDocuments(query);
  const lots = await Lot.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  res.status(200).json({
    success: true,
    data: {
      lots,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    }
  });
});

export const getLot = catchAsync(async (req, res) => {
  const lot = await Lot.findById(req.params.id);

  if (!lot) {
    return res.status(404).json({
      success: false,
      message: 'Lote no encontrado'
    });
  }

  res.status(200).json({
    success: true,
    data: lot
  });
});

export const updateLot = catchAsync(async (req, res) => {
  const lot = await Lot.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  if (!lot) {
    return res.status(404).json({
      success: false,
      message: 'Lote no encontrado'
    });
  }

  res.status(200).json({
    success: true,
    data: lot
  });
});

export const deleteLot = catchAsync(async (req, res) => {
  const lot = await Lot.findByIdAndDelete(req.params.id);

  if (!lot) {
    return res.status(404).json({
      success: false,
      message: 'Lote no encontrado'
    });
  }

  res.status(200).json({
    success: true,
    message: 'Lote eliminado correctamente'
  });
});
