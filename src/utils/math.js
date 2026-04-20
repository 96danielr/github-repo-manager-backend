export const roundMoney = (value) => {
  if (value === undefined || value === null || isNaN(value)) return 0;
  return Math.round(Number(value) * 100) / 100;
};

export const parseNumStringWithLocalization = (val) => {
  if (typeof val === 'number') return val;
  if (val === null || val === undefined || val === '') return 0;

  let s = val.toString().trim().replace(/[$\s]/g, '');

  // Si hay tanto puntos como comas, identificamos los decimales
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // Formato LatAm/EU: 1.234,56
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato US: 1,234.56
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    // Solo coma: 1.234 (no válido) o 1,23 (decimal) o 0,123 (decimal)
    const parts = s.split(',');
    if (parts.length === 2 && (parts[1].length !== 3 || !parts[0] || Number(parts[0]) === 0)) {
      s = s.replace(',', '.');
    } else {
      // Múltiples comas o exactamente 3 dígitos después de la única coma: son miles
      s = s.replace(/,/g, '');
    }
  } else if (s.includes('.')) {
    // Solo punto
    const parts = s.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0] && Number(parts[0]) !== 0)) {
      s = s.replace(/\./g, '');
    }
  }

  const result = parseFloat(s);
  return isNaN(result) ? 0 : result;
};
