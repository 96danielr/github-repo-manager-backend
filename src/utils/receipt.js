import PDFDocument from 'pdfkit';

/**
 * Generate a PDF cash receipt and stream it to the response.
 * @param {Object} data - Payment and client data
 * @param {Object} res - Express response object
 */
export const generateReceiptStream = async (data, res) => {
  const {
    quotaNumber,
    amount,
    date,
    clientName,
    clientId,
    companyName,
    lotInfo,
    paymentBank,
    observations,
  } = data;

  const doc = new PDFDocument({ margin: 50 });

  // Stream directly to response
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=recibo_${quotaNumber}.pdf`);
  doc.pipe(res);

  // Header
  doc.fontSize(20).text(companyName.toUpperCase(), { align: 'center' });
  doc.fontSize(10).text('RECIBO DE CAJA', { align: 'center' });
  doc.moveDown();

  // Horizontal line
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown();

  // Body
  const leftCol = 100;
  const rightCol = 350;
  doc.fontSize(12);

  doc.text('Recibo No:', 50, doc.y, { continued: true }).text(`${quotaNumber}`, leftCol);
  doc.text('Fecha:', 300, doc.y - 12, { continued: true }).text(`${new Date(date).toLocaleDateString()}`, rightCol);
  doc.moveDown(0.5);

  doc.text('Recibido de:', 50, doc.y, { continued: true }).text(`${clientName}`, leftCol);
  doc.text('ID/Cédula:', 300, doc.y - 12, { continued: true }).text(`${clientId}`, rightCol);
  doc.moveDown(0.5);

  doc.text('Suma de:', 50, doc.y, { continued: true }).text(`$${amount.toLocaleString()}`, leftCol);
  doc.moveDown(0.5);

  doc.text('Concepto:', 50, doc.y, { continued: true }).text(`Pago cuota #${quotaNumber} - ${lotInfo}`, leftCol);
  doc.moveDown(0.5);

  if (paymentBank) {
    doc.text('Banco/F. Pago:', 50, doc.y, { continued: true }).text(`${paymentBank}`, leftCol);
    doc.moveDown(0.5);
  }

  if (observations) {
    doc.text(`Observaciones:`, 50, doc.y);
    doc.fontSize(10).text(observations, 50, doc.y + 5, { width: 500 });
    doc.moveDown(2);
  } else {
    doc.moveDown(2);
  }

  // Footer
  doc.moveDown(4);
  doc.fontSize(8).text('Este documento es un comprobante de pago generado electrónicamente.', { align: 'center' });
  doc.text(`Generado el: ${new Date().toLocaleString()}`, { align: 'center' });

  doc.end();
};
