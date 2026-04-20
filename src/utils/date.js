/**
 * Helper to parse dates from Excel serial numbers or standard date strings/objects.
 * @param {any} val - Value to parse
 * @returns {Date|null}
 */
export const parseExcelDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;

  if (typeof val === 'number') {
    // Excel date serial number (days since 1900-01-01)
    return new Date(Math.round((val - 25569) * 86400 * 1000));
  }

  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Format a Date object to DD-MM-YY string
 * @param {Date|string} date
 * @returns {string}
 */
export const formatDateSmall = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear().toString().slice(-2);
  return `${day}-${month}-${year}`;
};

/**
 * Validates if a string is a valid ISO date
 */
export const isValidISODate = (val) => {
  if (!val) return false;
  return !isNaN(Date.parse(val));
};
