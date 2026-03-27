import Lot from '../models/Lot.js';
import Client from '../models/Client.js';
import Contract from '../models/Contract.js';
import Quota from '../models/Quota.js';
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
    const { page = 1, limit = 10, search, sortBy, order } = req.query;
    const skip = (page - 1) * limit;

    // Dynamic sort
    let sortObj = { createdAt: -1 };
    if (sortBy) {
      sortObj = { [sortBy]: order === 'asc' ? 1 : -1 };
    }

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
      .sort(sortObj)
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

/**
 * Marks a lot as sold, creates a contract and generates quotas
 */
export const sellLot = async (req, res, next) => {
  try {
    const { id } = req.params; // lotId
    const { id: tenantId, companyId } = req.tenant;
    const { 
      clientId, 
      clientData, 
      totalValue, 
      installmentsCount, 
      initialQuotaPercentage, 
      initialQuotasCount = 1, 
      contractDate,
      startDate,
      negotiation = 'Venta Directa'
    } = req.body;

    const lot = await Lot.findById(id);
    if (!lot) return res.status(404).json({ success: false, message: 'Lote no encontrado' });
    if (lot.status === 'vendido') return res.status(400).json({ success: false, message: 'Lote ya está vendido' });

    // 1. Get or Create Client
    let client;
    if (clientId) {
      client = await Client.findById(clientId);
      if (!client) return res.status(404).json({ success: false, message: 'Cliente seleccionado no existe' });
    } else if (clientData) {
      client = await Client.create({
        ...clientData,
        tenantId,
        companyId,
      });
    } else {
      return res.status(400).json({ success: false, message: 'Debe seleccionar un cliente o proporcionar datos para uno nuevo' });
    }

    // 2. Initial Calculations
    const initialAmountTotal = totalValue * (initialQuotaPercentage / 100);
    const residualAmount = totalValue - initialAmountTotal;
    const installmentValue = residualAmount / (installmentsCount || 1);

    // 3. Create Contract
    const contract = await Contract.create({
      tenantId,
      companyId,
      client: client._id,
      lot: lot._id,
      totalValue,
      installmentsCount,
      installmentValue,
      contractDate: contractDate || new Date(),
      startDate: startDate || new Date(),
      negotiation,
      status: 'ACTIVO',
    });

    // 4. Mark Lot as Sold
    lot.status = 'vendido';
    await lot.save();

    // 5. Generate Quotas
    const quotas = [];

    // Initial Quotas
    const initialValPerQuota = initialAmountTotal / (initialQuotasCount || 1);
    for (let i = 1; i <= initialQuotasCount; i++) {
      quotas.push({
        tenantId,
        companyId,
        contract: contract._id,
        number: i,
        type: 'inicial',
        value: initialValPerQuota,
        status: 'pendiente',
      });
    }

    // Regular Quotas
    for (let i = 1; i <= installmentsCount; i++) {
      quotas.push({
        tenantId,
        companyId,
        contract: contract._id,
        number: i,
        type: 'normal',
        value: installmentValue,
        status: 'pendiente',
      });
    }

    if (quotas.length > 0) {
      await Quota.insertMany(quotas);
    }

    res.status(200).json({
      success: true,
      message: 'Lote vendido exitosamente y contrato generado',
      data: {
        contract,
        client,
      },
    });
  } catch (error) {
    next(error);
  }
};

