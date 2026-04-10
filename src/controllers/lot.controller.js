import Lot from '../models/Lot.js';
import Client from '../models/Client.js';
import Contract from '../models/Contract.js';
import Quota from '../models/Quota.js';
import { uploadToR2 } from '../utils/storage.js';

export const createLot = async (req, res, next) => {
  try {
    const { id: tenantId, companyId, role } = req.tenant;

    if (role === 'vendedor') {
      return res.status(403).json({ success: false, message: 'No tienes permiso para crear lotes' });
    }

    const { 
      stage, 
      nomenclature, 
      lotNumber, 
      area, 
      price, 
      images, 
      status,
      excelRowId,
    } = req.body;

    const lot = await Lot.create({
      stage,
      nomenclature,
      lotNumber,
      area,
      price,
      images: images || [],
      status: status || 'disponible',
      excelRowId,
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
    const { id: tenantId, companyId, role, userId } = req.tenant;
    const { page = 1, limit = 10, search, sortBy, order } = req.query;
    const skip = (page - 1) * limit;

    // Dynamic sort
    let sortObj = { createdAt: -1 };
    if (sortBy) {
      sortObj = { [sortBy]: order === 'asc' ? 1 : -1 };
    }

    let query = { tenantId, companyId };

    // If seller role, show:
    // 1. All available lots (to be sold)
    // 2. Lots sold by THEM
    if (role === 'vendedor') {
      query.$or = [
        { status: 'disponible' },
        { sellerId: userId },
      ];
    }

    if (search) {
      const searchFilter = {
        $or: [
          { stage: { $regex: search, $options: 'i' } },
          { nomenclature: { $regex: search, $options: 'i' } },
          { lotNumber: { $regex: search, $options: 'i' } },
        ],
      };
      
      // If we already have a $or from the role check, combine with $and
      if (query.$or) {
        query = { $and: [query, searchFilter] };
      } else {
        query.$or = searchFilter.$or;
      }
    }

    const total = await Lot.countDocuments(query);
    let lots = await Lot.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .populate({
        path: 'sellerId',
        populate: { path: 'accountId', select: 'fullName' },
      });

    // Handle existing sold lots that don't have sellerId stored yet
    const soldLotsWithoutSeller = lots
      .filter((l) => l.status === 'vendido' && !l.sellerId)
      .map((l) => l._id);

    if (soldLotsWithoutSeller.length > 0) {
      const contracts = await Contract.find({ lot: { $in: soldLotsWithoutSeller } })
        .populate({
          path: 'sellerId',
          populate: { path: 'accountId', select: 'fullName' },
        });

      const lotSellerMap = {};
      contracts.forEach((c) => {
        if (c.sellerId) {
          lotSellerMap[c.lot.toString()] = c.sellerId;
        }
      });

      // Map back to lots
      lots = lots.map((l) => {
        const lotIdStr = l._id.toString();
        if (lotSellerMap[lotIdStr]) {
          const lotObj = l.toObject();
          lotObj.sellerId = lotSellerMap[lotIdStr];
          return lotObj;
        }
        return l;
      });
    }

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
    const { role } = req.tenant;
    if (role === 'vendedor') {
      return res.status(403).json({ success: false, message: 'No tienes permiso para editar lotes' });
    }
    const { 
      stage, 
      nomenclature, 
      lotNumber, 
      area, 
      price, 
      images, 
      status,
    } = req.body;

    const lot = await Lot.findByIdAndUpdate(
      req.params.id, 
      { 
        stage, 
        nomenclature, 
        lotNumber, 
        area, 
        price, 
        images, 
        status,
      }, 
      {
        new: true,
        runValidators: true,
      },
    );

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
    const { role } = req.tenant;
    if (role === 'vendedor') {
      return res.status(403).json({ success: false, message: 'No tienes permiso para eliminar lotes' });
    }
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
    const { role } = req.tenant;
    if (role === 'vendedor') {
      return res.status(403).json({ success: false, message: 'No tienes permiso para subir imágenes' });
    }
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
    const { id: tenantId, companyId, role, userId } = req.tenant;
    const { 
      clientId, 
      clientData, 
      totalValue, 
      installmentsCount = 0, 
      initialQuotaPercentage = 0, 
      initialQuotasCount = 1, 
      contractDate,
      startDate,
      negotiation = 'Venta Directa',
      sellerId,
    } = req.body;

    const effectiveSellerId = sellerId || (role === 'vendedor' ? userId : null);

    const lot = await Lot.findById(id);
    if (!lot) return res.status(404).json({ success: false, message: 'Lote no encontrado' });
    if (lot.status === 'vendido') return res.status(400).json({ success: false, message: 'Lote ya está vendido' });

    // 1. Get or Create Client
    let client;
    if (clientId) {
      client = await Client.findOne({ _id: clientId, tenantId, companyId });
      if (!client) return res.status(404).json({ success: false, message: 'Cliente seleccionado no existe' });
    } else if (clientData) {
      // Avoid creating duplicate clients if one with same ID number already exists
      if (clientData.idNumber) {
        client = await Client.findOne({ idNumber: clientData.idNumber, tenantId, companyId });
      }
      
      if (!client) {
        client = await Client.create({
          ...clientData,
          tenantId,
          companyId,
        });
      }
    } else {
      return res.status(400).json({ success: false, message: 'Debe seleccionar un cliente o proporcionar datos para uno nuevo' });
    }

    const finalTotalValue = totalValue || lot.price || 0;

    // 2. Initial Calculations
    const initialAmountTotal = Math.round(finalTotalValue * (initialQuotaPercentage / 100) * 100) / 100;
    const residualAmount = Math.round((finalTotalValue - initialAmountTotal) * 100) / 100;
    
    // We'll calculate installments properly in step 5
    const installmentsCountParsed = parseInt(installmentsCount) || 0;
    const installmentValueEstimate = installmentsCountParsed > 0 ? Math.round((residualAmount / installmentsCountParsed) * 100) / 100 : 0;

    // 3. Create Contract
    const contract = await Contract.create({
      tenantId,
      companyId,
      client: client._id,
      lot: lot._id,
      totalValue: finalTotalValue,
      initialQuotaPercentage: parseFloat(initialQuotaPercentage) || 0,
      initialQuotasCount: parseInt(initialQuotasCount) || 1,
      installmentsCount: installmentsCountParsed,
      installmentValue: installmentValueEstimate,
      contractDate: contractDate || new Date(),
      startDate: startDate || new Date(),
      negotiation,
      sellerId: effectiveSellerId,
      status: 'ACTIVO',
    });

    // 4. Mark Lot as Sold
    lot.status = 'vendido';
    if (effectiveSellerId) lot.sellerId = effectiveSellerId;
    await lot.save();

    // 5. Generate Quotas with precise rounding and proper due dates
    const quotas = [];
    const baseContractDate = contractDate ? new Date(contractDate) : new Date();
    const baseStartDate = startDate ? new Date(startDate) : new Date();

    // Initial Quotas breakdown
    let currentInitialSum = 0;
    const iCount = parseInt(initialQuotasCount) || 1;
    const baseInitialVal = Math.round((initialAmountTotal / iCount) * 100) / 100;

    for (let i = 1; i <= iCount; i++) {
      let val = baseInitialVal;
      if (i === iCount) {
        val = Math.round((initialAmountTotal - currentInitialSum) * 100) / 100;
      }
      currentInitialSum += val;

      const dueDate = new Date(baseContractDate);
      dueDate.setMonth(dueDate.getMonth() + (i - 1));

      if (val > 0) {
        quotas.push({
          tenantId,
          companyId,
          contract: contract._id,
          number: i,
          type: 'inicial',
          value: val,
          dueDate,
          status: 'pendiente',
        });
      }
    }

    // Regular Quotas breakdown
    let currentNormalSum = 0;
    for (let i = 1; i <= installmentsCountParsed; i++) {
      let val = installmentValueEstimate;
      if (i === installmentsCountParsed) {
        val = Math.round((residualAmount - currentNormalSum) * 100) / 100;
      }
      currentNormalSum += val;

      const dueDate = new Date(baseStartDate);
      dueDate.setMonth(dueDate.getMonth() + (i - 1));
      
      // If paymentDay is specified, force the day of the month
      if (contract.paymentDay && contract.paymentDay >= 1 && contract.paymentDay <= 31) {
        dueDate.setDate(contract.paymentDay);
      }

      if (val > 0) {
        quotas.push({
          tenantId,
          companyId,
          contract: contract._id,
          number: i,
          type: 'normal',
          value: val,
          dueDate,
          status: 'pendiente',
        });
      }
    }

    if (quotas.length > 0) {
      await Quota.insertMany(quotas);
    }

    res.status(200).json({
      success: true,
      message: 'Lote vendido exitosamente y contrato generado con cuotas',
      data: {
        contract,
        client,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Gets the sale/contract details for a specific lot.
 */
export const getLotSaleDetail = async (req, res, next) => {
  try {
    const { id } = req.params; // lotId
    const { id: tenantId, companyId } = req.tenant; 

    const contract = await Contract.findOne({ lot: id, companyId, tenantId })
      .sort({ createdAt: -1 })
      .populate({
        path: 'client',
        select: 'name idNumber phone address email',
      })
      .populate({
        path: 'sellerId',
        populate: { path: 'accountId', select: 'fullName email' },
      })
      .populate({
        path: 'lot',
        select: 'sellerId',
        populate: {
          path: 'sellerId',
          populate: { path: 'accountId', select: 'fullName email' },
        },
      });

    if (!contract) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró un contrato para este lote',
      });
    }

    // Fallback: if contract doesn't have sellerId, take it from lot
    if (!contract.sellerId && contract.lot?.sellerId) {
      const contractObj = contract.toObject();
      contractObj.sellerId = contract.lot.sellerId;
      // Replace contract with the object containing the fallback seller
      res.status(200).json({
        success: true,
        data: {
          contract: contractObj,
          quotas: await Quota.find({ contract: contract._id }).sort({ type: 1, number: 1 }),
        },
      });
      return;
    }

    // Get quotas for this contract
    const quotas = await Quota.find({ contract: contract._id })
      .sort({ type: 1, number: 1 });

    res.status(200).json({
      success: true,
      data: {
        contract,
        quotas,
      },
    });
  } catch (error) {
    next(error);
  }
};
