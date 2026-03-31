import mongoose from 'mongoose';
import XLSX from 'xlsx';
import Client from '../models/Client.js';
import Lot from '../models/Lot.js';
import Contract from '../models/Contract.js';
import Quota from '../models/Quota.js';

/**
 * Parses an Excel file and imports clients, lots, contracts and quotas
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const importExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se subió ningún archivo' });
    }

    const { id: tenantId, companyId } = req.tenant;
    const includeSiigo = req.query.includeSiigo !== 'false'; // Default true
    const createClientsWithoutName = req.query.createClientsWithoutName !== 'false'; // Default true

    // Read workbook from buffer
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Convert to JSON for processing rows
    const data = XLSX.utils.sheet_to_json(sheet, { defval: null });

    let summary = {
      totalRows: data.length,
      clientsCreated: 0,
      clientsUpdated: 0,
      lotsCreated: 0,
      contractsCreated: 0,
      initialQuotasCreated: 0,
      normalQuotasCreated: 0,
      quotasMarkedPaid: 0,
      paymentsRegistered: 0,
      rowsProcessed: 0,
      rowsSkipped: 0,
      firmadoRows: 0,
    };

    let errors = [];
    let warnings = [];

    const getVal = (row, keyName) => {
      const keys = Object.keys(row);
      const targetClean = keyName.toLowerCase().replace(/\s+/g, ' ').trim();
      
      // Try exact match first to avoid "mixing" (e.g. LOTE vs LOTE.1)
      const exactKey = keys.find((k) => {
        const kClean = k.toLowerCase().replace(/\s+/g, ' ').trim();
        return kClean === targetClean;
      });
      
      if (exactKey) return row[exactKey];

      // Fallback to startsWith for cases with suffixes like .1, .2
      const prefixKey = keys.find((k) => {
        const kClean = k.toLowerCase().replace(/\s+/g, ' ').trim();
        return kClean.startsWith(targetClean + '.');
      });
      
      return prefixKey ? row[prefixKey] : undefined;
    };

    // Helper to parse numbers from strings with currency or separators (handles LatAm/EU and US formats)
    const parseNum = (val) => {
      if (typeof val === 'number') return val;
      if (val === null || val === undefined || val === '') return 0;
      
      let s = val.toString().trim().replace(/[$\s]/g, '');
      
      // If there are both dots and commas, identifying the decimal is easier
      if (s.includes(',') && s.includes('.')) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
          // LatAm/EU Style: 1.234,56
          s = s.replace(/\./g, '').replace(',', '.');
        } else {
          // US Style: 1,234.56
          s = s.replace(/,/g, '');
        }
      } else if (s.includes(',')) {
        // Only comma: 1.234 or 1,23 or 0,123
        const parts = s.split(',');
        // If it starts with 0 (or -0), or it has something other than 3 digits, it's a decimal
        if (parts.length === 2 && (parts[1].length !== 3 || !parts[0] || Number(parts[0]) === 0)) {
          s = s.replace(',', '.');
        } else {
          // Multiple commas or exactly 3 digits after the only comma: thousands
          s = s.replace(/,/g, '');
        }
      } else if (s.includes('.')) {
        // Only dot: 1.234 or 1.23 or 0.123
        const parts = s.split('.');
        // Multiple dots OR exactly 3 digits (and not starting with 0 or empty): thousands
        if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0] && Number(parts[0]) !== 0)) {
          s = s.replace(/\./g, '');
        }
      }
      
      const result = parseFloat(s);
      return isNaN(result) ? 0 : result;
    };



    // 1. PRE-LOAD CATALOGS for O(1) lookup and batch optimization
    const [existingLots, existingClients, existingContracts] = await Promise.all([
      Lot.find({ tenantId, companyId }),
      Client.find({ tenantId, companyId }),
      Contract.find({ tenantId, companyId }),
    ]);

    // Index maps
    const lotMap = new Map(); // key: stage|nomenclature|lotNumber
    existingLots.forEach((l) => lotMap.set(`${l.stage}|${l.nomenclature}|${l.lotNumber}`, l));

    const clientByCedula = new Map();
    const clientByExcelId = new Map();
    existingClients.forEach((c) => {
      if (c.idNumber) clientByCedula.set(c.idNumber, c);
      if (c.excelRowId) clientByExcelId.set(c.excelRowId.toString(), c);
    });

    const contractMap = new Map(); // key: clientId|lotId
    existingContracts.forEach((c) => contractMap.set(`${c.client}|${c.lot}`, c));

    // Operations collectors for bulkWrite
    const lotOps = [];
    const clientOps = [];
    const contractOps = [];
    const quotasToInsert = [];
    const contractIdsToClearQuotas = new Set();

    // Process each row of the Excel file
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2;
      const excelRowId = getVal(row, 'No.') || rowNum;

      try {
        const cedula = getVal(row, 'CEDULA')?.toString().trim() || undefined;
        const clienteNombre = getVal(row, 'CLIENTE')?.toString().trim();

        // 1. Lot Management (Logic: stage|nomen|lote)
        const stage = getVal(row, 'ETAPA')?.toString() || 'N/A';
        const nomenclature = getVal(row, 'NOMENCLATURA')?.toString() || 'N/A';
        const lotNumber = getVal(row, 'LOTE')?.toString() || 'N/A';
        const lotKey = `${stage}|${nomenclature}|${lotNumber}`;
        
        let lot = lotMap.get(lotKey);
        const lotData = {
          stage,
          nomenclature,
          lotNumber,
          area: parseNum(getVal(row, 'METROS 2')),
          excelRowId: excelRowId,
          tenantId,
          companyId,
        };

        if (!lot) {
          const newId = new mongoose.Types.ObjectId();
          lot = { ...lotData, _id: newId };
          lotMap.set(lotKey, lot);
          lotOps.push({
            insertOne: { document: lot },
          });
          summary.lotsCreated++;
        } else {
          lotOps.push({
            updateOne: {
              filter: { _id: lot._id },
              update: { $set: lotData },
            },
          });
        }

        // Check if there are any initial or normal quotas in this row
        const hasInitialQuotas = [1, 2, 3, 4, 5].some((j) => parseNum(getVal(row, `CUOTA INICIAL ${j}`)) > 0);
        const hasNormalQuotas = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].some((j) => parseNum(getVal(row, `CUOTA ${j}`)) > 0);
        const hasSiigoRecord = includeSiigo && (parseNum(getVal(row, 'RECAUDADO SIIGO 2024')) > 0 || parseNum(getVal(row, 'RECAUDADO SIIGO 2025')) > 0);

        if (!clienteNombre && !cedula && (!createClientsWithoutName || (!hasInitialQuotas && !hasNormalQuotas && !hasSiigoRecord))) {
          summary.rowsProcessed++;
          continue;
        }

        // Determine an effective name if missing
        const effectiveName = clienteNombre || (cedula ? `CLIENTE_CEDULA_${cedula}` : `CLIENTE_DESCONOCIDO_FILA_${rowNum}`);

        // 2. Client Management (Logic: cedula or excelRowId)
        let client = cedula ? clientByCedula.get(cedula) : clientByExcelId.get(excelRowId.toString());
        
        const clientData = {
          name: effectiveName,
          idNumber: cedula,
          phone: getVal(row, 'TELEFONO')?.toString(),
          behavior: getVal(row, 'COMPORTAMIENTO CLIENTE'),
          excelRowId: excelRowId,
          tenantId,
          companyId,
        };

        if (!client) {
          const newId = new mongoose.Types.ObjectId();
          client = { ...clientData, _id: newId };
          if (cedula) clientByCedula.set(cedula, client);
          clientByExcelId.set(excelRowId.toString(), client);
          clientOps.push({
            insertOne: { document: client },
          });
          summary.clientsCreated++;
        } else {
          clientOps.push({
            updateOne: {
              filter: { _id: client._id },
              update: { $set: clientData },
            },
          });
          summary.clientsUpdated++;
        }

        // 3. Contract Management (Logic: client|lot)
        const contractKey = `${client._id}|${lot._id}`;
        let contract = contractMap.get(contractKey);
        
        const contractInfo = {
          client: client._id,
          lot: lot._id,
          contractDate: parseExcelDate(getVal(row, 'FECHA CONTRATO')),
          negotiation: getVal(row, 'NEGOCIACION'),
          appendix: getVal(row, 'OTRO SI'),
          totalValue: parseNum(getVal(row, 'VALOR DEL CONTRATO')),
          installmentsCount: parseInt(getVal(row, 'NO. CUOTAS')) || 0,
          installmentValue: parseNum(getVal(row, 'VALOR CUOTA')),
          paymentDay: parseInt(getVal(row, 'DIA DE PAGO')) || 0,
          startDate: parseExcelDate(getVal(row, 'FECHA INICIO CUOTAS')),
          bonus: getVal(row, 'BONO'),
          bonusValue: parseNum(getVal(row, 'VALOR BONO')),
          commercial: getVal(row, 'COMERCIAL'),
          recaudadoSiigo2024: includeSiigo ? parseNum(getVal(row, 'RECAUDADO SIIGO 2024')) : 0,
          recaudadoSiigo2025: includeSiigo ? parseNum(getVal(row, 'RECAUDADO SIIGO 2025')) : 0,
          juridicalRequirement: getVal(row, 'REQUERIMIENTO JURIDICO'),
          observations: getVal(row, 'OBSERVACIONES'),
          excelRowId: excelRowId,
          tenantId,
          companyId,
        };

        if (!contract) {
          const newId = new mongoose.Types.ObjectId();
          contract = { ...contractInfo, _id: newId };
          contractMap.set(contractKey, contract);
          contractOps.push({
            insertOne: { document: contract },
          });
          summary.contractsCreated++;
        } else {
          contractOps.push({
            updateOne: {
              filter: { _id: contract._id },
              update: { $set: contractInfo },
            },
          });
        }
        // 4. Quotas Preparation (Logic: Presence in Excel = Paid)
        contractIdsToClearQuotas.add(contract._id);

        // Initial Quotas (1 to 5) - If value > 0, it means it was paid
        for (let j = 1; j <= 5; j++) {
          const quotaVal = getVal(row, `CUOTA INICIAL ${j}`);
          const val = parseNum(quotaVal);
          if (val > 0) {
            quotasToInsert.push({
              tenantId,
              companyId,
              contract: contract._id,
              number: j,
              type: 'inicial',
              value: val,
              status: 'pagado',
              excelRowId: excelRowId,
            });
            summary.initialQuotasCreated++;
            summary.quotasMarkedPaid++;
          }
        }

        // Regular Quotas (1 to 24) - If value > 0, it means it was paid
        for (let j = 1; j <= 24; j++) {
          const quotaVal = getVal(row, `CUOTA ${j}`);
          const val = parseNum(quotaVal);
          if (val > 0) {
            quotasToInsert.push({
              tenantId,
              companyId,
              contract: contract._id,
              number: j,
              type: 'normal',
              value: val,
              status: 'pagado',
              excelRowId: excelRowId,
            });
            summary.normalQuotasCreated++;
            summary.quotasMarkedPaid++;
          }
        }

        summary.rowsProcessed++;

      } catch (err) {
        console.error(`Error processing row ${rowNum}:`, err);
        errors.push(`Fila ${rowNum}: ${err.message}`);
      }
    }

    // 5. EXECUTE BULK OPERATIONS
    if (lotOps.length > 0) await Lot.bulkWrite(lotOps);
    if (clientOps.length > 0) await Client.bulkWrite(clientOps);
    if (contractOps.length > 0) await Contract.bulkWrite(contractOps);

    // Replace Quotas in bulk for touched contracts
    if (contractIdsToClearQuotas.size > 0) {
      await Quota.deleteMany({ contract: { $in: Array.from(contractIdsToClearQuotas) } });
      if (quotasToInsert.length > 0) {
        // Use chunks for very large files to avoid memory/packet limits
        const chunk = 1000;
        for (let i = 0; i < quotasToInsert.length; i += chunk) {
          await Quota.insertMany(quotasToInsert.slice(i, i + chunk), { ordered: false });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Importación procesada con éxito',
      summary,
      errors,
      warnings,
    });

  } catch (error) {
    console.error('Import controller error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al procesar el archivo Excel',
      error: error.message,
    });
  }
};

/**
 * Exports all data from the database to an Excel file
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const exportExcel = async (req, res) => {
  try {
    const { id: tenantId, companyId } = req.tenant;

    // 1. Fetch all contracts for this tenant+company and populate their client and lot
    const contracts = await Contract.find({ tenantId, companyId }).populate('client').populate('lot');
    
    // 2. Prepare data for Excel
    const exportData = [];
    
    for (const contract of contracts) {
      const client = contract.client;
      const lot = contract.lot;
      
      // Fetch quotas for this contract
      const quotas = await Quota.find({ contract: contract._id }).sort({ type: 1, number: 1 });
      
      // Calculations
      const initialQuotas = quotas.filter((q) => q.type === 'inicial');
      const regularQuotas = quotas.filter((q) => q.type === 'normal');
      
      const paidQuotasCount = quotas.filter((q) => q.status === 'pagado').length;
      const pendingQuotasCount = quotas.filter((q) => q.status !== 'pagado').length;
      
      const totalRecaudado = quotas
        .filter((q) => q.status === 'pagado')
        .reduce((sum, q) => sum + (q.value || 0), 0);
        
      const totalPorRecaudar = quotas
        .filter((q) => q.status !== 'pagado')
        .reduce((sum, q) => sum + (q.value || 0), 0);
        
      const percentageRecaudo = contract.totalValue > 0 
        ? (totalRecaudado / contract.totalValue) * 100 
        : 0;
        
      const hasMora = quotas.some((q) => q.status === 'mora');
      
      const totalSiigo = (contract.recaudadoSiigo2024 || 0) + (contract.recaudadoSiigo2025 || 0);
      const porRecaudarSiigo = Math.max(0, contract.totalValue - totalSiigo);
      const percentageSiigo = contract.totalValue > 0 
        ? (totalSiigo / contract.totalValue) * 100 
        : 0;

      // Helper to return empty string if value is 0 or null/undefined
      const emptyIfZero = (val) => (val === 0 || val === null || val === undefined ? '' : val);
      const emptyIfEmpty = (val) => (val === null || val === undefined ? '' : val);
      
      // Helper to format date as DD-MM-YY
      const formatDate = (date) => {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const year = d.getFullYear().toString().slice(-2);
        return `${day}-${month}-${year}`;
      };

      const row = {
        'No.': contract.excelRowId || client?.excelRowId || lot?.excelRowId,
        'ETAPA': emptyIfEmpty(lot?.stage),
        'NOMENCLATURA': emptyIfEmpty(lot?.nomenclature),
        'LOTE': emptyIfEmpty(lot?.lotNumber),
        'METROS 2': emptyIfZero(lot?.area),
        'CEDULA': emptyIfEmpty(client?.idNumber),
        'CLIENTE': emptyIfEmpty(client?.name),
        'FECHA CONTRATO': formatDate(contract.contractDate),
        'NEGOCIACION': emptyIfEmpty(contract.negotiation),
        'OTRO SI': emptyIfEmpty(contract.appendix),
        'FECHA INICIO CUOTAS': formatDate(contract.startDate),
        'VALOR DEL CONTRATO': emptyIfZero(contract.totalValue),
        'NO. CUOTAS': emptyIfZero(contract.installmentsCount),
        'VALOR CUOTA': emptyIfZero(contract.installmentValue),
        'LOTE.1': emptyIfEmpty(lot?.lotNumber),
        'DIA DE PAGO': emptyIfZero(contract.paymentDay),
        'TELEFONO': emptyIfEmpty(client?.phone),
        'BONO': emptyIfEmpty(contract.bonus),
        '# CUOTA INICIAL': emptyIfZero(initialQuotas.length),
        'VALOR BONO': emptyIfZero(contract.bonusValue),
      };

      // Add Initial Quotas (fixed columns 1-5)
      for (let j = 1; j <= 5; j++) {
        const q = initialQuotas.find((iq) => iq.number === j);
        row[`CUOTA INICIAL ${j}`] = q ? emptyIfZero(q.value) : '';
      }

      // Add Regular Quotas (fixed columns 1-24)
      for (let j = 1; j <= 24; j++) {
        const q = regularQuotas.find((rq) => rq.number === j);
        row[`CUOTA ${j}`] = q ? emptyIfZero(q.value) : '';
      }

      // Add trailing calculated fields
      row['CUOTAS PAGADAS'] = emptyIfZero(paidQuotasCount);
      row['CUOTAS PENDIENTES'] = emptyIfZero(pendingQuotasCount);
      row['RECAUDADO'] = emptyIfZero(totalRecaudado);
      row['POR RECAUDAR'] = emptyIfZero(totalPorRecaudar);
      row['% RECAUDO'] = emptyIfZero(percentageRecaudo);
      row['ESTADO DE MORA'] = hasMora ? 'EN MORA' : '';
      row['RECAUDADO SIIGO 2024'] = emptyIfZero(contract.recaudadoSiigo2024);
      row['RECAUDADO SIIGO 2025'] = emptyIfZero(contract.recaudadoSiigo2025);
      row['TOTAL RECAUDADO SIIGO'] = emptyIfZero(totalSiigo);
      row['POR RECAUDAR EN SIIGO'] = emptyIfZero(porRecaudarSiigo);
      row['% RECAUDO.1'] = emptyIfZero(percentageSiigo);
      row['COMERCIAL'] = emptyIfEmpty(contract.commercial);
      row['COMPORTAMIENTO CLIENTE'] = emptyIfEmpty(client?.behavior);
      row['REQUERIMIENTO JURIDICO'] = emptyIfEmpty(contract.juridicalRequirement);
      row['OBSERVACIONES'] = emptyIfEmpty(contract.observations);

      exportData.push(row);
    }
    
    // Sort by ID to match original order if possible
    exportData.sort((a, b) => (a['No.'] || 0) - (b['No.'] || 0));

    // 3. Create workbook and sheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos Exportados');
    
    // 4. Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // 5. Send file with proper headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=export-cobranza.xlsx');
    res.send(buffer);
    
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al exportar datos del sistema', 
      error: error.message, 
    });
  }
};

/**
 * Helper to parse dates from Excel
 * @param {any} val - Value from excel cell
 * @returns {Date|null}
 */
function parseExcelDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  
  if (typeof val === 'number') {
    // Excel date serial number (days since 1900-01-01)
    return new Date(Math.round((val - 25569) * 86400 * 1000));
  }
  
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Generates an Excel template with headers for data import
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export const downloadTemplate = async (req, res) => {
  try {
    // Define the headers and sample data in the exact order as exportExcel
    const row = {
      'No.': 1,
      'ETAPA': 'Etapa 1',
      'NOMENCLATURA': 'Mz A Lote 5',
      'LOTE': '5',
      'METROS 2': 100,
      'CEDULA': '12345678',
      'CLIENTE': 'Juan Pérez',
      'FECHA CONTRATO': '15-01-24',
      'NEGOCIACION': 'Crédito Directo',
      'OTRO SI': '',
      'FECHA INICIO CUOTAS': '01-02-24',
      'VALOR DEL CONTRATO': 25000000,
      'NO. CUOTAS': 24,
      'VALOR CUOTA': 1000000,
      'LOTE.1': '5',
      'DIA DE PAGO': 5,
      'TELEFONO': '3101234567',
      'BONO': 'Bono Fin de Año',
      '# CUOTA INICIAL': 5,
      'VALOR BONO': 500000,
    };

    // Add Initial Quotas (fixed columns 1-5)
    for (let j = 1; j <= 5; j++) {
      row[`CUOTA INICIAL ${j}`] = 200000;
    }

    // Add Regular Quotas (fixed columns 1-24)
    for (let j = 1; j <= 24; j++) {
      row[`CUOTA ${j}`] = j <= 6 ? 1000000 : '';
    }

    // Add trailing calculated and additional fields
    Object.assign(row, {
      'CUOTAS PAGADAS': '',
      'CUOTAS PENDIENTES': '',
      'RECAUDADO': '',
      'POR RECAUDAR': '',
      '% RECAUDO': '',
      'ESTADO DE MORA': '',
      'RECAUDADO SIIGO 2024': 0,
      'RECAUDADO SIIGO 2025': 0,
      'TOTAL RECAUDADO SIIGO': '',
      'POR RECAUDAR EN SIIGO': '',
      '% RECAUDO.1': '',
      'COMERCIAL': 'Asesor 1',
      'COMPORTAMIENTO CLIENTE': 'Excelente',
      'REQUERIMIENTO JURIDICO': '',
      'OBSERVACIONES': 'Cliente puntual',
    });

    const templateData = [row];

    // Create workbook and sheet
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla Importación');
    
    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Send file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=plantilla-cobranza.xlsx');
    res.send(buffer);
    
  } catch (error) {
    console.error('Template error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al generar la plantilla', 
      error: error.message, 
    });
  }
};
