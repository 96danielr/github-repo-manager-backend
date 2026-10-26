/**
 * Notifications Service Implementation (WhatsApp & Email)
 * This module follows a provider pattern to allow easy switching between messaging providers.
 * SMS and Twilio were removed: WhatsApp goes through Meta and email through Resend.
 */

import { Resend } from 'resend';

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

// --- WhatsApp Providers ---

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

const whatsappProviders = {
  dummy: dummyWhatsAppProvider,
  meta: metaWhatsAppProvider,
};

const emailProviders = {
  dummy: dummyEmailProvider,
  sendme: sendMeEmailProvider,
  resend: resendEmailProvider,
};

// Unknown or missing names fall back to dummy, so nothing is sent until Meta is configured.
const activeWhatsAppProvider = process.env.WHATSAPP_PROVIDER || 'dummy';
const activeEmailProvider = process.env.EMAIL_PROVIDER || 'resend';
const isNotificationsEnabled = process.env.ENABLE_NOTIFICATIONS === 'true';

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
