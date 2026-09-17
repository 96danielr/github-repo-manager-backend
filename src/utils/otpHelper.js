import VerificationToken from '../models/VerificationToken.js';
import Client from '../models/Client.js';
import Company from '../models/Company.js';
import Contract from '../models/Contract.js';
import Quota from '../models/Quota.js';
import crypto from 'crypto';
import { sendEmail, sendSMS, sendWhatsApp } from './notifications.js';

export const sendOTPCode = async (tenantId, companyId, clientId, type, destination, companyName) => {
  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins validity

  await VerificationToken.create({
    tenantId,
    companyId,
    clientId,
    token,
    code,
    type,
    destination,
    expiresAt,
  });

  const message = `Tu codigo de seguridad de Operix para ingresar a reportar tu pago es: ${code}. Valido por 15 minutos.`;

  if (type === 'email') {
    const subject = `Código de verificación de seguridad - ${companyName}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 500px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
        <h3 style="color: #0284c7; text-align: center;">Código de Seguridad</h3>
        <p>Hola,</p>
        <p>Has solicitado acceder al reporte de pago de tu inmueble. Usa el siguiente código de verificación:</p>
        <div style="text-align: center; margin: 25px 0;">
          <span style="font-family: monospace; font-size: 28px; font-weight: bold; background: #f1f5f9; padding: 10px 20px; border-radius: 6px; letter-spacing: 4px; border: 1px solid #cbd5e1;">${code}</span>
        </div>
        <p style="font-size: 13px; color: #64748b; text-align: center;">Este código es válido por 15 minutos. No compartas este código con nadie.</p>
      </div>
    `;
    await sendEmail(destination, subject, emailHtml);
  } else if (type === 'phone') {
    await sendSMS(destination, message);
    await sendWhatsApp(destination, message);
  }

  return token;
};
