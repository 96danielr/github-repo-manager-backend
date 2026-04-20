import Bank from '../models/Bank.js';
import XLSX from 'xlsx';

/**
 * Get all banks (Global list)
 */
export const getBanks = async (req, res, next) => {
  try {
    let { page = 1, limit = 100, search, sortBy = 'socialDenomination', sortOrder = 'asc', companyId: queryCompanyId, companySlug } = req.query;
    
    let { tenantId, companyId } = req.user || {};
    
    // Support public requests or requests without full middleware context
    if (!tenantId && (queryCompanyId || companySlug)) {
      const { default: Company } = await import('../models/Company.js');
      let company;
      
      if (queryCompanyId) {
        company = await Company.findById(queryCompanyId).select('tenantId _id');
      } else if (companySlug) {
        company = await Company.findOne({ slug: companySlug }).select('tenantId _id');
      }

      if (company) {
        tenantId = company.tenantId;
        companyId = company._id;
      }
    }

    let query = { 
      isActive: true,
      $or: [
        { tenantId: null }, // Global banks
        { tenantId: tenantId || null, companyId: companyId || null }, // Company specific banks
      ],
    };

    if (search) {
      const searchFilter = {
        $or: [
          { socialDenomination: { $regex: search, $options: 'i' } },
          { acronym: { $regex: search, $options: 'i' } },
          { code: { $regex: search, $options: 'i' } },
        ],
      };
      
      // Combine query with search
      query = { $and: [query, searchFilter] };
    }

    const sort = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sort.socialDenomination = 1;
    }

    const total = await Bank.countDocuments(query);
    const banks = await Bank.find(query)
      .sort(sort)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        banks,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a single bank (Super Admin only)
 */
export const createBank = async (req, res, next) => {
  try {
    const { tenantId, companyId } = req.user || {};
    
    const bankData = {
      ...req.body,
      tenantId: tenantId || undefined,
      companyId: companyId || undefined,
    };

    const bank = await Bank.create(bankData);

    res.status(201).json({
      success: true,
      data: bank,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk create banks (Super Admin only)
 */
export const bulkCreateBanks = async (req, res, next) => {
  try {
    const { banks } = req.body;
    const { tenantId, companyId } = req.user || {};

    if (!Array.isArray(banks)) {
      return res.status(400).json({
        success: false,
        message: 'Data must be an array of banks',
      });
    }

    // Inject tenant/company context if available
    const scopedBanks = banks.map(bank => ({
      ...bank,
      tenantId: bank.tenantId || tenantId,
      companyId: bank.companyId || companyId
    }));

    const result = await Bank.insertMany(scopedBanks, { ordered: false });

    res.status(201).json({
      success: true,
      data: result,
      count: result.length,
    });
  } catch (error) {
    if (error.name === 'BulkWriteError' || error.result) {
      return res.status(201).json({
        success: true,
        data: error.result.result.insertedIds,
        count: error.result.result.nInserted,
        message: 'Some records were inserted, but some failed (likely duplicates)',
        errors: error.writeErrors?.length || 0,
      });
    }
    next(error);
  }
};

/**
 * Update bank details
 */
export const updateBank = async (req, res, next) => {
  try {
    const { tenantId, companyId, role } = req.user || {};
    
    // Safety check: Don't allow non-superadmins to update global banks or other company's banks
    const query = { _id: req.params.id };
    if (role !== 'superadmin') {
      query.tenantId = tenantId;
      query.companyId = companyId;
    }

    const bank = await Bank.findOneAndUpdate(query, req.body, {
      new: true,
      runValidators: true,
    });

    if (!bank) {
      return res.status(404).json({
        success: false,
        message: 'Banco no encontrado',
      });
    }

    res.status(200).json({
      success: true,
      data: bank,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete bank
 */
export const deleteBank = async (req, res, next) => {
  try {
    const { tenantId, companyId, role } = req.user || {};
    const bankId = req.params.id;

    const bank = await Bank.findById(bankId);
    if (!bank) {
      return res.status(404).json({ success: false, message: 'Banco no encontrado' });
    }

    // Protection: Seed banks (tenantId null) cannot be deleted
    const isSeedBank = !bank.tenantId;

    if (isSeedBank && role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'No puedes gestionar bancos del sistema' });
    }

    // Non-superadmins can only manage their own company banks
    if (role !== 'superadmin' && (bank.tenantId?.toString() !== tenantId?.toString() || bank.companyId?.toString() !== companyId?.toString())) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para gestionar este banco' });
    }

    // Check if used in payments
    // We import dynamically to avoid circular dependency if any
    const { default: Payment } = await import('../models/Payment.js');
    const isUsed = await Payment.exists({ 
      banco: bank.acronym, 
      tenantId: bank.tenantId || tenantId,
    });

    // Strategy: Deactivate if seed bank or if it has transactions. 
    // Superadmin also deactivates instead of deletes for safety as requested.
    if (isUsed || isSeedBank || role === 'superadmin') {
      bank.isActive = false;
      await bank.save();
      return res.status(200).json({
        success: true,
        message: isUsed 
          ? 'El banco tiene pagos asociados y ha sido desactivado' 
          : 'Banco desactivado correctamente',
      });
    }

    // If not used and not seed bank, and not superadmin (though superadmin deactivates per request)
    await Bank.findByIdAndDelete(bankId);

    res.status(200).json({
      success: true,
      message: 'Banco eliminado correctamente',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Parses an Excel file and imports banks (Global)
 */
export const importBanksExcel = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se subió ningún archivo' });
    }

    // Read workbook from buffer
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      return res.status(400).json({ success: false, message: 'El archivo está vacío' });
    }

    const summary = {
      total: data.length,
      created: 0,
      skipped: 0,
      errors: [],
    };

    // Mapping helper
    const getVal = (row, ...aliases) => {
      for (const alias of aliases) {
        if (row[alias] !== undefined) return row[alias];
        // Case-insensitive lookup
        const key = Object.keys(row).find((k) => k.toLowerCase().trim() === alias.toLowerCase().trim());
        if (key) return row[key];
      }
      return undefined;
    };

    const { tenantId, companyId, role } = req.user || {};
    const banksToInsert = [];

    for (const row of data) {
      const type = getVal(row, 'TIPO', 'type');
      const code = getVal(row, 'CÓDIGO', 'CODIGO', 'code')?.toString().trim();
      const competentDelegation = getVal(row, 'DELEGATURA COMPETENTE', 'competentDelegation');
      const socialDenomination = getVal(row, 'DENOMINACIÓN SOCIAL', 'DENOMINACION SOCIAL', 'socialDenomination');
      const acronym = getVal(row, 'SIGLA', 'acronym', 'sigla');

      if (!acronym || !socialDenomination || !code) {
        summary.skipped++;
        continue;
      }

      banksToInsert.push({
        type: type || 'N/A',
        code,
        competentDelegation,
        socialDenomination,
        acronym,
        tenantId: role === 'superadmin' ? undefined : tenantId,
        companyId: role === 'superadmin' ? undefined : companyId,
      });
    }

    // Insert with ordered false to avoid stopping on duplicates
    try {
      if (banksToInsert.length > 0) {
        const result = await Bank.insertMany(banksToInsert, { ordered: false });
        summary.created = result.length;
      }
    } catch (err) {
      if (err.name === 'BulkWriteError' || err.result) {
        summary.created = err.result.nInserted;
        summary.skipped += (banksToInsert.length - err.result.nInserted);
      } else {
        throw err;
      }
    }

    res.status(200).json({
      success: true,
      message: 'Procesamiento de bancos completado',
      summary,
    });
  } catch (error) {
    next(error);
  }
};
