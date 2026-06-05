/**
 * Notifications Service Implementation (SMS & Email)
 * This module follows a provider pattern to allow easy switching between messaging providers.
 */

import { Resend } from 'resend';
import twilio from 'twilio';

const SENDME_API_BASE = 'https://app.sendme123.com/api';
const SENDME_API_KEY = process.env.SENDME_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Lazy-initialize so the app doesn't crash if the key is missing/placeholder
let _resend = null;
const getResend = () => {
  if (!_resend) {
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured. Please set a valid key in .env');
    }
    _resend = new Resend(RESEND_API_KEY);
  }
  return _resend;
};

let _twilioClient = null;
const getTwilioClient = () => {
  if (!_twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are not configured in environment variables');
    }
    _twilioClient = twilio(accountSid, authToken);
  }
  return _twilioClient;
};

// --- SMS Providers ---

const sendMeSMSProvider = {
  send: async (to, message) => {
    try {
      if (!SENDME_API_KEY) {
        throw new Error('SENDME_API_KEY is not configured');
      }

      // Cleaning phone number for SendMe (expects 10 digits for CO usually, but let's send it as provided or cleaned)
      const cleanTo = to.replace(/\D/g, '').slice(-10); // Simple hack for CO mobile numbers

      const response = await fetch(`${SENDME_API_BASE}/messages/sms/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': SENDME_API_KEY,
        },
        body: JSON.stringify({
          message,
          contacts: [cleanTo],
          country: 'CO',
        }),
      });

      const data = await response.json();
      console.log(`[SMS SENDME SUCCESS] To: ${cleanTo}, Message: ${message.substring(0, 30)}... Response:`, data);
      
      if (!response.ok) throw new Error(data.message || 'Error from SendMe API');

      return { success: true, provider: 'sendme', data };
    } catch (error) {
      console.error('[SMS SENDME ERROR]', error);
      return { success: false, error: error.message };
    }
  },
};

const formatTwilioPhone = (phone) => {
  let cleaned = phone.toString().replace(/\D/g, '');
  if (cleaned.length === 10 && cleaned.startsWith('3')) {
    cleaned = '57' + cleaned;
  }
  return `+${cleaned}`;
};

const twilioSMSProvider = {
  send: async (to, message) => {
    try {
      const from = process.env.TWILIO_SMS_FROM;
      if (!from) {
        throw new Error('TWILIO_SMS_FROM is not configured');
      }

      const cleanTo = formatTwilioPhone(to);
      const client = getTwilioClient();

      const response = await client.messages.create({
        to: cleanTo,
        from: from,
        body: message,
      });

      console.log(`[SMS TWILIO SUCCESS] To: ${cleanTo}, Message: ${message.substring(0, 30)}... ID: ${response.sid}`);
      return { success: true, provider: 'twilio', data: response };
    } catch (error) {
      console.error('[SMS TWILIO ERROR]', error);
      return { success: false, error: error.message };
    }
  },
};

const dummySMSProvider = {
  send: async (to, message) => {
    console.log(`[SMS DUMMY PROVIDER] Sending to ${to}: ${message}`);
    return { success: true, provider: 'dummy', messageId: Date.now().toString() };
  },
};

// --- WhatsApp Providers ---

const twilioWhatsAppProvider = {
  send: async (to, message) => {
    try {
      const from = process.env.TWILIO_WHATSAPP_FROM || `whatsapp:${process.env.TWILIO_SMS_FROM}`;
      if (!from) {
        throw new Error('TWILIO_WHATSAPP_FROM is not configured');
      }

      const cleanTo = formatTwilioPhone(to);
      const whatsappTo = `whatsapp:${cleanTo}`;
      const whatsappFrom = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;

      const client = getTwilioClient();

      const response = await client.messages.create({
        to: whatsappTo,
        from: whatsappFrom,
        body: message,
      });

      console.log(`[WHATSAPP TWILIO SUCCESS] To: ${whatsappTo}, Message: ${message.substring(0, 30)}... ID: ${response.sid}`);
      return { success: true, provider: 'twilio', data: response };
    } catch (error) {
      console.error('[WHATSAPP TWILIO ERROR]', error);
      return { success: false, error: error.message };
    }
  },
};

const metaWhatsAppProvider = {
  send: async (to, message) => {
    try {
      const { whatsappService } = await import('../services/whatsapp.service.js');
      const config = {
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
        wabaId: process.env.WHATSAPP_WABA_ID
      };

      if (!config.accessToken || !config.phoneNumberId) {
        throw new Error('Meta WhatsApp is not configured in environment variables');
      }

      const result = await whatsappService.sendTextMessage(config, to, message);
      console.log(`[WHATSAPP META SUCCESS] To: ${to}, Message: ${message.substring(0, 30)}...`);
      return { success: true, provider: 'meta', data: result };
    } catch (error) {
      console.error('[WHATSAPP META ERROR]', error);
      return { success: false, error: error.message };
    }
  }
};

const dummyWhatsAppProvider = {
  send: async (to, message) => {
    console.log(`[WHATSAPP DUMMY PROVIDER] Sending to ${to}: ${message}`);
    return { success: true, provider: 'dummy' };
  },
};

// --- Email Providers ---

const resendEmailProvider = {
  send: async (to, subject, htmlMessage) => {
    try {
      if (!RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is not configured');
      }

      console.log(`[EMAIL RESEND ATTEMPT] To: ${to}, Subject: ${subject}`);
      
      const { data, error } = await getResend().emails.send({
        from: process.env.EMAIL_FROM || 'Recaudos <info@operix.com.co>',
        to: [to],
        subject,
        html: htmlMessage,
      });

      if (error) {
        throw error;
      }

      console.log(`[EMAIL RESEND SUCCESS] To: ${to}, ID: ${data?.id}`);
      return { success: true, provider: 'resend', data };
    } catch (error) {
      console.error('[EMAIL RESEND ERROR]', error);
      return { success: false, error: error.message };
    }
  },
};

const sendMeEmailProvider = {
  send: async (to, subject, htmlMessage) => {
    try {
      if (!SENDME_API_KEY) {
        throw new Error('SENDME_API_KEY is not configured');
      }

      const response = await fetch(`${SENDME_API_BASE}/messages/email/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': SENDME_API_KEY,
        },
        body: JSON.stringify({
          subject,
          message: htmlMessage,
          contacts: [to],
        }),
      });

      const data = await response.json();
      console.log(`[EMAIL SENDME SUCCESS] To: ${to}, Subject: ${subject}... Response:`, data);
      
      if (!response.ok) throw new Error(data.message || 'Error from SendMe Email API');

      return { success: true, provider: 'sendme', data };
    } catch (error) {
      console.error('[EMAIL SENDME ERROR]', error);
      return { success: false, error: error.message };
    }
  },
};

const dummyEmailProvider = {
  send: async (to, subject, htmlMessage) => {
    console.log(`[EMAIL DUMMY PROVIDER] Sending to ${to}: [${subject}]`);
    return { success: true, provider: 'dummy' };
  },
};

// --- Service Configuration ---

const smsProviders = {
  dummy: dummySMSProvider,
  sendme: sendMeSMSProvider,
  twilio: twilioSMSProvider,
};

const whatsappProviders = {
  dummy: dummyWhatsAppProvider,
  meta: metaWhatsAppProvider,
  twilio: twilioWhatsAppProvider,
};

const emailProviders = {
  dummy: dummyEmailProvider,
  sendme: sendMeEmailProvider,
  resend: resendEmailProvider,
};

const activeSMSProvider = process.env.SMS_PROVIDER || 'sendme';
const activeWhatsAppProvider = process.env.WHATSAPP_PROVIDER || 'dummy';
const activeEmailProvider = process.env.EMAIL_PROVIDER || 'resend';
const isNotificationsEnabled = process.env.ENABLE_NOTIFICATIONS === 'true';

/**
 * Send an SMS message
 */
export const sendSMS = async (to, message) => {
  if (!isNotificationsEnabled) {
    console.log(`[SMS DISABLED] Would have sent to ${to}: ${message}`);
    return { success: true, provider: 'disabled', messageId: 'disabled' };
  }
  const provider = smsProviders[activeSMSProvider] || dummySMSProvider;
  return await provider.send(to, message);
};

/**
 * Send a WhatsApp message
 */
export const sendWhatsApp = async (to, message) => {
  if (!isNotificationsEnabled) {
    console.log(`[WHATSAPP DISABLED] Would have sent to ${to}: ${message}`);
    return { success: true, provider: 'disabled' };
  }
  const provider = whatsappProviders[activeWhatsAppProvider] || dummyWhatsAppProvider;
  return await provider.send(to, message);
};

/**
 * Send an Email message
 */
export const sendEmail = async (to, subject, htmlMessage) => {
  if (!isNotificationsEnabled) {
    console.log(`[EMAIL DISABLED] Would have sent to ${to}: [${subject}]`);
    return { success: true, provider: 'disabled' };
  }
  const provider = emailProviders[activeEmailProvider] || dummyEmailProvider;
  return await provider.send(to, subject, htmlMessage);
};
