/**
 * Notifications Service Implementation (SMS & Email)
 * This module follows a provider pattern to allow easy switching between messaging providers.
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

const dummySMSProvider = {
  send: async (to, message) => {
    console.log(`[SMS DUMMY PROVIDER] Sending to ${to}: ${message}`);
    return { success: true, provider: 'dummy', messageId: Date.now().toString() };
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
};

const emailProviders = {
  dummy: dummyEmailProvider,
  sendme: sendMeEmailProvider,
  resend: resendEmailProvider,
};

const activeSMSProvider = process.env.SMS_PROVIDER || 'sendme';
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
