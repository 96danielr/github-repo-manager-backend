export const PROPERTY_TYPES = ['lotes', 'casas', 'apartamentos', 'locales'];

const TYPE_ALIASES = {
  lote: 'lotes',
  lotes: 'lotes',
  terreno: 'lotes',
  terrenos: 'lotes',
  casa: 'casas',
  casas: 'casas',
  apartamento: 'apartamentos',
  apartamentos: 'apartamentos',
  apto: 'apartamentos',
  aptos: 'apartamentos',
  local: 'locales',
  locales: 'locales',
  comercial: 'locales',
  comerciales: 'locales',
};

const PREFIXES = {
  stage: [],
  manzana: ['mz', 'mza', 'manzana', 'block'],
  tower: ['torre', 'bloque', 'edificio'],
  floor: ['piso', 'nivel'],
  unit: ['lote', 'lt', 'apto', 'ap', 'apartamento', 'casa', 'local', 'lc', 'unidad'],
};

const stripDiacritics = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function normalizePropertyType(value, fallback = 'lotes') {
  if (value === null || value === undefined) return fallback;
  const key = String(value).trim().toLowerCase();
  return TYPE_ALIASES[key] || fallback;
}

export function normalizeValue(value, field = 'unit') {
  if (value === null || value === undefined) return '';
  let result = String(value).trim();
  if (!result) return '';
  result = stripDiacritics(result).toUpperCase();
  result = result.replace(/[\-_./]+/g, ' ').replace(/\s+/g, ' ').trim();
  const prefixes = PREFIXES[field] || [];
  for (const prefix of prefixes) {
    const token = prefix.toUpperCase();
    if (result === token) {
      return '';
    }
    const regex = new RegExp('^' + token + '\\s+');
    if (regex.test(result)) {
      result = result.replace(regex, '').trim();
    }
  }
  return result;
}

export function buildUnitKey(propertyType, data = {}, options = {}) {
  const type = normalizePropertyType(propertyType);
  const includeFloor = options.includeFloorForApartments === true;
  const stage = normalizeValue(data.stage, 'stage');
  const manzana = normalizeValue(data.manzana, 'manzana');
  const tower = normalizeValue(data.tower, 'tower');
  const floor = normalizeValue(data.floor, 'floor');
  const unit = normalizeValue(data.unitNumber !== undefined ? data.unitNumber : data.lotNumber, 'unit');

  let parts;
  switch (type) {
    case 'apartamentos':
      parts = includeFloor ? [stage, tower, floor, unit] : [stage, tower, unit];
      break;
    case 'locales':
      parts = [stage, unit];
      break;
    case 'casas':
    case 'lotes':
    default:
      parts = [stage, manzana, unit];
      break;
  }

  const prefix = { lotes: 'lote', casas: 'casa', apartamentos: 'apto', locales: 'local' }[type];
  return [prefix, ...parts].join('|');
}

export function buildNomenclature(propertyType, data = {}) {
  const type = normalizePropertyType(propertyType);
  const stage = data.stage ? String(data.stage).trim() : '';
  const manzana = data.manzana ? String(data.manzana).trim() : '';
  const tower = data.tower ? String(data.tower).trim() : '';
  const floor = data.floor ? String(data.floor).trim() : '';
  const unitRaw = data.unitNumber !== undefined ? data.unitNumber : data.lotNumber;
  const unit = unitRaw ? String(unitRaw).trim() : '';

  const parts = [];
  if (stage) parts.push(stage);

  if (type === 'apartamentos') {
    if (tower) parts.push(`Torre ${tower}`);
    if (floor) parts.push(`Piso ${floor}`);
    if (unit) parts.push(`Apto ${unit}`);
  } else if (type === 'casas') {
    if (manzana) parts.push(`Mz ${manzana}`);
    if (unit) parts.push(`Casa ${unit}`);
  } else if (type === 'locales') {
    if (unit) parts.push(`Local ${unit}`);
  } else {
    if (manzana) parts.push(`Mz ${manzana}`);
    if (unit) parts.push(`Lote ${unit}`);
  }

  return parts.join(' - ');
}

export function missingIdentityFields(propertyType, data = {}) {
  const type = normalizePropertyType(propertyType);
  const missing = [];
  if (!normalizeValue(data.stage, 'stage')) missing.push('stage');
  if (type === 'apartamentos') {
    if (!normalizeValue(data.tower, 'tower')) missing.push('tower');
  } else if (type !== 'locales') {
    if (!normalizeValue(data.manzana, 'manzana')) missing.push('manzana');
  }
  const unitRaw = data.unitNumber !== undefined ? data.unitNumber : data.lotNumber;
  if (!normalizeValue(unitRaw, 'unit')) missing.push('lotNumber');
  return missing;
}
