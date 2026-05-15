

class WhatsAppService {
  constructor() {
    this.apiVersion = 'v18.0';
  }

  getGraphUrl(config) {
    if (!config?.accessToken || !config?.phoneNumberId || !config?.wabaId) {
      throw new Error('WhatsApp no está configurado para esta empresa');
    }
    return {
      baseUrl: `https://graph.facebook.com/${this.apiVersion}/${config.phoneNumberId}`,
      wabaUrl: `https://graph.facebook.com/${this.apiVersion}/${config.wabaId}`,
      accessToken: config.accessToken,
    };
  }

  /**
   * Fetch approved message templates from Meta
   */
  async getTemplates(config) {
    try {
      const { wabaUrl, accessToken } = this.getGraphUrl(config);
      const response = await fetch(`${wabaUrl}/message_templates`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Error fetching WhatsApp templates');
      }

      // Return only approved templates
      return data.data.filter(t => t.status === 'APPROVED');
    } catch (error) {
      console.error('WhatsApp Service Error (getTemplates):', error);
      throw error;
    }
  }

  async createTemplate(config, data) {
    try {
      const { wabaUrl, accessToken } = this.getGraphUrl(config);
      const response = await fetch(`${wabaUrl}/message_templates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || 'Error creating WhatsApp template');
      }

      return result;
    } catch (error) {
      console.error('WhatsApp Service Error (createTemplate):', error);
      throw error;
    }
  }

  async deleteTemplate(config, name) {
    try {
      const { wabaUrl, accessToken } = this.getGraphUrl(config);
      const response = await fetch(`${wabaUrl}/message_templates?name=${name}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || 'Error deleting WhatsApp template');
      }

      return result;
    } catch (error) {
      console.error('WhatsApp Service Error (deleteTemplate):', error);
      throw error;
    }
  }

  /**
   * Send a text message to a customer
   */
  async sendTextMessage(config, to, text) {
    try {
      const { baseUrl, accessToken } = this.getGraphUrl(config);
      const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: this.formatPhoneNumber(to),
          type: 'text',
          text: { preview_url: false, body: text },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Error sending WhatsApp message');
      }

      return data;
    } catch (error) {
      console.error('WhatsApp Service Error:', error);
      throw error;
    }
  }

  /**
   * Send a template message (required for initiating conversations)
   */
  async sendTemplateMessage(config, to, templateName, languageCode = 'es', components = []) {
    try {
      const { baseUrl, accessToken } = this.getGraphUrl(config);
      const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: this.formatPhoneNumber(to),
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            components,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Error sending WhatsApp template');
      }

      return data;
    } catch (error) {
      console.error('WhatsApp Service Error:', error);
      throw error;
    }
  }

  /**
   * Format phone number to E.164 without '+'
   */
  formatPhoneNumber(phone) {
    // Remove all non-numeric characters
    let cleaned = phone.toString().replace(/\D/g, '');
    
    // Colombia specific: if it has 10 digits (starts with 3), add 57
    if (cleaned.length === 10 && cleaned.startsWith('3')) {
      cleaned = '57' + cleaned;
    }
    
    return cleaned;
  }
}

export const whatsappService = new WhatsAppService();
