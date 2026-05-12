export const roundMoney = (value) => {
  if (value === undefined || value === null || isNaN(value)) return 0;
  return Math.round(Number(value) * 100) / 100;
};

export const parseNumStringWithLocalization = (val) => {
  if (typeof val === 'number') return val;
  if (val === null || val === undefined || val === '') return 0;

  // Limpiamos signo de peso, espacios, puntos y comas
  // Los puntos y comas se tratan como separadores de miles/visuales según instrucciones
  let s = val.toString().trim()
    .replace(/[$\s]/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '');

  const result = parseFloat(s);
  return isNaN(result) ? 0 : result;
};
