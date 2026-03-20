import Lot from '../models/Lot.js';
import { uploadToR2 } from '../utils/storage.js';

export const createLot = async (req, res, next) => {
  try {
    const { id: tenantId, companyId } = req.tenant;

    const lot = await Lot.create({
      ...req.body,
      tenantId,
      companyId,
    });

    res.status(201).json({
      success: true,
      data: lot,
    });
  } catch (error) {
    next(error);
  }
};

export const getLots = async (req, res, next) => {
  try {
    const { id: tenantId, companyId } = req.tenant;
    const { page = 1, limit = 10, search } = req.query;
    const skip = (page - 1) * limit;

    let query = { tenantId, companyId };
    if (search) {
      query.$or = [
        { stage: { $regex: search, $options: 'i' } },
        { nomenclature: { $regex: search, $options: 'i' } },
        { lotNumber: { $regex: search, $options: 'i' } },
      ];
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
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getLot = async (req, res, next) => {
  try {
    const lot = await Lot.findById(req.params.id);

    if (!lot) {
      return res.status(404).json({
        success: false,
        message: 'Lote no encontrado',
      });
    }

    res.status(200).json({
      success: true,
      data: lot,
    });
  } catch (error) {
    next(error);
  }
};

export const updateLot = async (req, res, next) => {
  try {
    const lot = await Lot.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!lot) {
      return res.status(404).json({
        success: false,
        message: 'Lote no encontrado',
      });
    }

    res.status(200).json({
      success: true,
      data: lot,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteLot = async (req, res, next) => {
  try {
    const lot = await Lot.findByIdAndDelete(req.params.id);

    if (!lot) {
      return res.status(404).json({
        success: false,
        message: 'Lote no encontrado',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Lote eliminado correctamente',
    });
  } catch (error) {
    next(error);
  }
};

export const uploadLotImages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se subieron imágenes',
      });
    }

    const lot = await Lot.findById(id);
    if (!lot) {
      return res.status(404).json({
        success: false,
        message: 'Lote no encontrado',
      });
    }

    // Process files in memory (multer memoryStorage)
    const uploadPromises = files.map((file) => uploadToR2(file, `lots/${id}`));
    const imageUrls = await Promise.all(uploadPromises);

    lot.images = [...(lot.images || []), ...imageUrls];
    await lot.save();

    res.status(200).json({
      success: true,
      data: lot,
    });
  } catch (error) {
    next(error);
  }
};

export const getLotsPublic = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const { search } = req.query;

    let query = { companyId };
    if (search) {
      query.$or = [
        { stage: { $regex: search, $options: 'i' } },
        { nomenclature: { $regex: search, $options: 'i' } },
        { lotNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const lots = await Lot.find(query)
      .sort({ stage: 1, lotNumber: 1 });

    res.status(200).json({
      success: true,
      data: lots,
    });
  } catch (error) {
    next(error);
  }
};
