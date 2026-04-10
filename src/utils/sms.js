/**
 * SMS Service Implementation
 * This module follows a provider pattern to allow easy switching between SMS providers.
 */

// Implementation for a dummy provider (logging to console)
const dummyProvider = {
  send: async (to, message) => {
    console.log(`[SMS DUMMY PROVIDER] Sending to ${to}: ${message}`);
    return { success: true, provider: 'dummy', messageId: Date.now().toString() };
  }
};

// Implementation for an AWS SNS provider (example)
const awsProvider = {
  send: async (to, message) => {
    // This would use AWS SDK
    console.log(`[SMS AWS PROVIDER] Sending to ${to}: ${message}`);
    // implementation details...
    return { success: true, provider: 'aws' };
  }
};

// Current provider configuration
// You can change this to use different providers based on environment variables or config
const providers = {
  dummy: dummyProvider,
  aws: awsProvider,
};

const activeProvider = process.env.SMS_PROVIDER || 'dummy';

/**
 * Send an SMS message using the configured provider.
 * @param {string} to - Recipient phone number
 * @param {string} message - Message content
 */
export const sendSMS = async (to, message) => {
  try {
    const provider = providers[activeProvider] || dummyProvider;
    console.log(`Using SMS provider: ${activeProvider}`);
    
    // Basic phone number cleaning if needed
    const cleanTo = to.startsWith('+') ? to : `+${to}`;
    
    const result = await provider.send(cleanTo, message);
    return result;
  } catch (error) {
    console.error('Error sending SMS:', error);
    // We don't throw here to avoid failing the whole transaction if SMS fails
    return { success: false, error: error.message };
  }
};
