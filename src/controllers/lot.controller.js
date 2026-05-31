import mongoose from 'mongoose';
import Lot from '../models/Lot.js';
import Client from '../models/Client.js';
import Contract from '../models/Contract.js';
import Quota from '../models/Quota.js';
import { uploadToR2 } from '../utils/storage.js';
import { logAudit } from '../utils/auditLogger.js';
import { roundMoney } from '../utils/math.js';
import { checkLotExpirations } from '../utils/lotExpiration.js';

export const createLot = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user;

    const { 
      stage, 
      manzana,
      nomenclature, 
      lotNumber, 
      area, 
      price, 
      images, 
      status,
      excelRowId,
      maxInstallments,
    } = req.body;

    const lot = await Lot.create({
      stage,
      manzana,
      nomenclature,
      lotNumber,
      area,
      price,
      images: images || [],
      status: status || 'disponible',
      maxInstallments: maxInstallments !== undefined && maxInstallments !== '' ? parseInt(maxInstallments) : 24,
      excelRowId,
      tenantId,
      companyId,
    });

    await logAudit(req, {
      action: 'CREATE_LOT',
      module: 'LOTS',
      targetId: lot._id,
      details: { stage, lotNumber, price }
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
    const { tenantId, companyId, role, userId } = req.user;
    
    // Run lazy cleanup for expired reservations
    await checkLotExpirations(tenantId, companyId);

    const { 
      page = 1, 
      limit = 10, 
      search, 
      sortBy, 
      order, 
      status,
      manzana,
      stage,
      sellerId,
      minArea,
      maxArea
    } = req.query;
    const skip = (page - 1) * limit;

    // Dynamic sort
    let sortObj = { createdAt: -1 };
    if (sortBy) {
      sortObj = { [sortBy]: order === 'asc' ? 1 : -1 };
    }

    let query = { tenantId, companyId };

    if (status) {
      query.status = status;
    }
    if (manzana) {
      query.manzana = { $regex: manzana.trim(), $options: 'i' };
    }
    if (stage) {
      query.stage = { $regex: stage.trim(), $options: 'i' };
    }
    if (sellerId) {
      query.sellerId = sellerId;
    }
    if (minArea || maxArea) {
      query.area = {};
      if (minArea) query.area.$gte = parseFloat(minArea);
      if (maxArea) query.area.$lte = parseFloat(maxArea);
    }

    // If seller role, show:
    // 1. All available lots (to be sold)
    // 2. Lots sold by THEM
    if (role === 'vendedor') {
      query.$or = [
        { status: 'disponible' },
        { status: 'apartado' },
        { status: 'separado' },
        { sellerId: userId },
      ];
    }

    if (search) {
      const searchFilter = {
        $or: [
          { stage: { $regex: search, $options: 'i' } },
          { manzana: { $regex: search, $options: 'i' } },
          { nomenclature: { $regex: search, $options: 'i' } },
          { lotNumber: { $regex: search, $options: 'i' } },
          { reference: { $regex: search, $options: 'i' } },
        ],
      };

      const searchNum = parseFloat(search);
      if (!isNaN(searchNum)) {
        searchFilter.$or.push({ area: searchNum });
      }
      
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
      })
      .lean();

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
    const { tenantId, companyId } = req.user;
    
    // Run lazy cleanup for this specific tenant/company
    await checkLotExpirations(tenantId, companyId);

    const lot = await Lot.findById(req.params.id)
      .populate({
        path: 'sellerId',
        populate: { path: 'accountId', select: 'fullName email' },
      })
      .populate('reservationBy')
      .lean();

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
    // Permiso ya validado por middleware

    const { 
      stage, 
      manzana,
      nomenclature, 
      lotNumber, 
      area, 
      price, 
      images, 
      status,
      maxInstallments,
    } = req.body;

    const lot = await Lot.findByIdAndUpdate(
      req.params.id, 
      { 
        stage, 
        manzana,
        nomenclature, 
        lotNumber, 
        area, 
        price, 
        images, 
        status,
        maxInstallments: maxInstallments !== undefined && maxInstallments !== '' ? parseInt(maxInstallments) : 24,
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
    // Permiso ya validado por middleware

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
    // Permiso ya validado por middleware

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

    let query = { companyId, status: 'disponible' };
    if (search) {
      query.$or = [
        { stage: { $regex: search, $options: 'i' } },
        { nomenclature: { $regex: search, $options: 'i' } },
        { lotNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const lots = await Lot.find(query)
      .select('stage nomenclature lotNumber area price status images')
      .sort({ stage: 1, lotNumber: 1 })
      .lean();

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
    const { tenantId, companyId, role, userId } = req.user;
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
      bonus = '',
      bonusValue = 0,
      separationAmount = 0,
      initialQuotaDueDate,
      paymentDay,
    } = req.body;

    const effectiveSellerId = sellerId || (role === 'vendedor' ? userId : null);

    const lot = await Lot.findById(id);
    if (!lot) return res.status(404).json({ success: false, message: 'Lote no encontrado' });
    
    // Validate installments count
    const maxInstallmentsAllowed = lot.maxInstallments !== undefined ? lot.maxInstallments : 24;
    const installmentsCountParsed = parseInt(installmentsCount) || 0;
    if (installmentsCountParsed > maxInstallmentsAllowed) {
      return res.status(400).json({ 
        success: false, 
        message: `El número máximo de cuotas permitido para este lote es ${maxInstallmentsAllowed}. No se puede seleccionar ${installmentsCountParsed} cuotas.` 
      });
    }

    // Allow selling if it's available or reserved by the same client/seller
    if (lot.status === 'vendido') {
      return res.status(400).json({ success: false, message: 'Lote ya está vendido' });
    }

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

    // CHECK: Reserved lots can only be sold to the client who reserved them
    if (['apartado', 'separado'].includes(lot.status)) {
      if (lot.reservationBy && lot.reservationBy.toString() !== client._id.toString()) {
        return res.status(400).json({ 
          success: false, 
          message: 'Este lote está reservado por otro cliente y no puede ser vendido a terceros.' 
        });
      }
    }

    const bonusValueParsed = parseFloat(bonusValue) || 0;
    const baseTotalValue = totalValue || lot.price || 0;
    const finalTotalValue = baseTotalValue - bonusValueParsed;

    // 2. Initial Calculations
    const rawInitialAmountTotal = roundMoney(finalTotalValue * (initialQuotaPercentage / 100));
    const effectiveSeparationAmount = parseFloat(separationAmount) || 0;
    const initialAmountTotal = Math.max(0, rawInitialAmountTotal - effectiveSeparationAmount);
    const residualAmount = roundMoney(finalTotalValue - rawInitialAmountTotal);
    
    // We'll calculate installments properly in step 5
    const installmentValueEstimate = installmentsCountParsed > 0 ? roundMoney(residualAmount / installmentsCountParsed) : 0;

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
      bonus,
      bonusValue: bonusValueParsed,
      paymentDay: parseInt(paymentDay) || null,
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

    // Separation Quota: If separationAmount > 0, create it fully paid!
    if (effectiveSeparationAmount > 0) {
      quotas.push({
        tenantId,
        companyId,
        contract: contract._id,
        number: 0,
        type: 'inicial',
        value: effectiveSeparationAmount,
        dueDate: contractDate || new Date(),
        status: 'pagado',
        amountPaid: effectiveSeparationAmount,
        paymentDate: contractDate || new Date(),
        paymentObservations: 'Abono de separación del lote descontado de la cuota inicial',
      });
    }

    // Initial Quotas breakdown
    let currentInitialSum = 0;
    const iCount = parseInt(initialQuotasCount) || 1;
    const baseInitialVal = roundMoney(initialAmountTotal / iCount);
    const baseInitialDueDate = initialQuotaDueDate ? new Date(initialQuotaDueDate) : new Date(baseContractDate);

    for (let i = 1; i <= iCount; i++) {
      let val = baseInitialVal;
      if (i === iCount) {
        val = roundMoney(initialAmountTotal - currentInitialSum);
      }
      currentInitialSum += val;

      const dueDate = new Date(baseInitialDueDate);
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
        val = roundMoney(residualAmount - currentNormalSum);
      }
      currentNormalSum += val;

      const dueDate = new Date(baseStartDate);
      dueDate.setMonth(dueDate.getMonth() + (i - 1));
      
      // If paymentDay is specified, force the day of the month safely
      const effectivePaymentDay = parseInt(paymentDay) || (contract.paymentDay && contract.paymentDay >= 1 && contract.paymentDay <= 31 ? contract.paymentDay : null);
      if (effectivePaymentDay && effectivePaymentDay >= 1 && effectivePaymentDay <= 31) {
        const lastDay = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate();
        dueDate.setDate(Math.min(effectivePaymentDay, lastDay));
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

    await logAudit(req, {
      action: 'SELL_LOT',
      module: 'LOTS',
      targetId: lot._id,
      details: { 
        clientId: client._id, 
        totalValue: finalTotalValue, 
        installments: installmentsCount,
        contractId: contract._id
      }
    });

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
    const { tenantId, companyId } = req.user; 

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
/**
 * Reserves a lot in 'apartado' or 'separado' status
 */
export const reserveLot = async (req, res, next) => {
  try {

    const { id } = req.params;
    const { tenantId, companyId, userId } = req.user;
    const { type, clientId, clientData, observations, amount, expirationDays } = req.body;

    if (!['apartado', 'separado'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Tipo de reserva inválido' });
    }

    const lot = await Lot.findById(id);
    if (!lot) return res.status(404).json({ success: false, message: 'Lote no encontrado' });

    // Check if lot is already reserved/sold
    if (lot.status === 'vendido') {
      return res.status(400).json({ success: false, message: 'El lote ya está vendido' });
    }

    // Logic for transition from 'separado' to 'apartado' for the same client
    const isUpgrade = lot.status === 'separado' && type === 'apartado' && clientId && lot.reservationBy?.toString() === clientId;

    if (lot.status !== 'disponible' && !isUpgrade) {
      return res.status(400).json({ 
        success: false, 
        message: `El lote ya se encuentra en estado '${lot.status}' y no puede ser ${type === 'separado' ? 'separado' : 'apartado'} por otro cliente o nuevamente.` 
      });
    }

    // 1. Get or Create Client
    let client;
    if (clientId) {
      client = await Client.findOne({ _id: clientId, tenantId, companyId });
      if (!client) return res.status(404).json({ success: false, message: 'Cliente seleccionado no existe' });
    } else if (clientData) {
      if (clientData.idNumber) {
        client = await Client.findOne({ idNumber: clientData.idNumber, tenantId, companyId });
      }
      if (!client) {
        client = await Client.create({ ...clientData, tenantId, companyId });
      }
    } else {
      return res.status(400).json({ success: false, message: 'Debe proporcionar datos del cliente' });
    }

    // 2. Separate logic for 'separado' (min $500,000)
    if (type === 'separado') {
      const minAmount = 500000;
      const paidAmount = parseFloat(amount) || 0;
      if (paidAmount < minAmount) {
        return res.status(400).json({ 
          success: false, 
          message: `Para separar el lote se requiere un monto mínimo de $${minAmount.toLocaleString()}` 
        });
      }
    }

    // 3. Update Lot
    const days = parseInt(expirationDays) || (type === 'separado' ? 30 : 5);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    lot.status = type;
    lot.reservedAt = new Date();
    lot.expiresAt = expiresAt;
    lot.reservationBy = client._id;
    lot.reservationDetails = observations;
    lot.sellerId = userId;
    await lot.save();

    await logAudit(req, {
      action: `RESERVE_LOT_${type.toUpperCase()}`,
      module: 'LOTS',
      targetId: lot._id,
      details: { clientId: client._id, type, amount }
    });

    res.status(200).json({
      success: true,
      message: `Lote ${type} exitosamente`,
      data: lot
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Manually releases a lot back to 'disponible'
 */
export const releaseLot = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, observations } = req.body;

    const lot = await Lot.findById(id);
    if (!lot) return res.status(404).json({ success: false, message: 'Lote no encontrado' });

    const previousStatus = lot.status;
    lot.status = 'disponible';
    lot.reservedAt = undefined;
    lot.expiresAt = undefined;
    lot.reservationBy = undefined;
    lot.reservationDetails = undefined;
    lot.sellerId = undefined;
    await lot.save();

    await logAudit(req, {
      action: 'RELEASE_LOT',
      module: 'LOTS',
      targetId: lot._id,
      details: { previousStatus, reason, observations }
    });

    res.status(200).json({
      success: true,
      message: 'Lote liberado correctamente y ya está disponible',
      data: lot
    });
  } catch (error) {
    next(error);
  }
};
