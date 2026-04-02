import Bank from '../models/Bank.js';
import XLSX from 'xlsx';

/**
 * Get all banks (Global list)
 */
export const getBanks = async (req, res, next) => {
  try {
    const { page = 1, limit = 100, search } = req.query;
    
    let query = { isActive: true };
    if (search) {
      query.$or = [
        { socialDenomination: { $regex: search, $options: 'i' } },
        { acronym: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Bank.countDocuments(query);
    const banks = await Bank.find(query)
      .sort({ socialDenomination: 1 })
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
    const bank = await Bank.create(req.body);

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
    const { banks } = req.body; // Array of bank objects

    if (!Array.isArray(banks)) {
      return res.status(400).json({
        success: false,
        message: 'Data must be an array of banks',
      });
    }

    // Filter out duplicates based on code if needed, but insertMany handles errors
    // Use ordered: false to continue inserting even if one bank fails (e.g. duplicate key)
    const result = await Bank.insertMany(banks, { ordered: false });

    res.status(201).json({
      success: true,
      data: result,
      count: result.length,
    });
  } catch (error) {
    // If some succeeded but others failed due to duplicates, insertMany throws an error with partial results
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
    const bank = await Bank.findByIdAndUpdate(req.params.id, req.body, {
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
    const bank = await Bank.findByIdAndDelete(req.params.id);

    if (!bank) {
      return res.status(404).json({
        success: false,
        message: 'Banco no encontrado',
      });
    }

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
