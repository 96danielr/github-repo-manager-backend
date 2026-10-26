import { whatsappService } from '../services/whatsapp.service.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Client from '../models/Client.js';
import Company from '../models/Company.js';
import AppError from '../utils/AppError.js';
import { GRAPH_API_URL } from '../config/meta.js';

/**
 * Meta Webhook Verification
 */
export const verifyWebhook = (req, res) => {
  console.log('--- WHATSAPP WEBHOOK VERIFICATION ATTEMPT ---');
  console.log('Query params:', req.query);
  
  const mode = req.query['hub.mode'] || req.query['hub_mode'];
  const token = req.query['hub.verify_token'] || req.query['hub_verify_token'];
  const challenge = req.query['hub.challenge'] || req.query['hub_challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED SUCCESSFULLY');
      return res.status(200).send(challenge);
    } else {
      console.error('WEBHOOK_VERIFICATION_FAILED: Token mismatch');
      console.log('Expected:', process.env.WHATSAPP_VERIFY_TOKEN);
      console.log('Received:', token);
      return res.sendStatus(403);
    }
  }
  
  console.log('WEBHOOK_VERIFICATION_FAILED: Missing mode or token');
  res.status(400).send('Verification failed');
};

/**
 * Receive Webhook Notifications
 */
export const handleWebhook = async (req, res) => {
  try {
    const { body } = req;

    // Log the entire payload for debugging
    console.log('--- WHATSAPP WEBHOOK RECEIVED ---');
    console.log(JSON.stringify(body, null, 2));

    if (body.object) {
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages[0]
      ) {
        const messageData = body.entry[0].changes[0].value.messages[0];
        const waId = messageData.from; // Phone number with country code
        const metadata = body.entry[0].changes[0].value.metadata;
        const phoneId = metadata.phone_number_id;

        // Find company by phone ID
        const company = await Company.findOne({ 'integrations.whatsappPhoneId': phoneId });
        if (!company) {
          console.warn('No company found for phone ID:', phoneId);
          return res.status(200).send('EVENT_RECEIVED'); // ignore
        }
        const tenantId = company.tenantId;

        console.log(`Incoming message from: ${waId}`);

        // Handle different message types
        let text = '';
        if (messageData.type === 'text') {
          text = messageData.text.body;
        } else if (messageData.type === 'button') {
          text = messageData.button.text;
        } else if (messageData.type === 'interactive') {
          const type = messageData.interactive.type;
          text = type === 'button_reply' 
            ? messageData.interactive.button_reply.title 
            : messageData.interactive.list_reply.title;
        } else {
          text = `[Mensaje tipo ${messageData.type}]`;
        }

        // Find client - cleaning waId to match common storage formats
        // Meta sends e.g. "573001234567"
        // We look for a client whose phone contains the last 10 digits or matches exactly
        const last10Digits = waId.slice(-10);
        
        const client = await Client.findOne({ 
          tenantId,
          phone: { $regex: last10Digits }
        });

        if (client) {
          console.log(`Matched client: ${client.name} (ID: ${client._id})`);
          
          let conv = await Conversation.findOne({ clientId: client._id });
          if (!conv) {
            conv = await Conversation.create({
              tenantId: client.tenantId,
              clientId: client._id,
              waId: waId,
              lastMessage: text
            });
            console.log('Created new conversation');
          } else {
            conv.lastMessage = text;
            conv.unreadCount += 1;
            conv.updatedAt = new Date();
            await conv.save();
            console.log('Updated existing conversation');
          }

          await Message.create({
            conversationId: conv._id,
            tenantId: client.tenantId,
            waId: messageData.id,
            direction: 'inbound',
            type: messageData.type === 'text' ? 'text' : 'button',
            body: text,
            status: 'received'
          });
          console.log('Message stored successfully');
        } else {
          console.warn(`No client found for phone: ${waId} (searched for ${last10Digits})`);
          // OPTIONAL: In a real app, you might want to create a "Prospect" or handle anonymous messages
        }
      } else if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
        // Handle status updates (sent, delivered, read)
        const status = body.entry[0].changes[0].value.statuses[0];
        console.log(`Status update for ${status.id}: ${status.status}`);
        
        await Message.findOneAndUpdate(
          { waId: status.id },
          { status: status.status }
        );
      }
      
      res.status(200).send('EVENT_RECEIVED');
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).send('Internal Server Error');
  }
};

/**
 * Send manual message to client
 */
export const sendMessage = async (req, res, next) => {
  try {
    // Same switch as the automatic notifications: environments with notifications off never send.
    if (process.env.ENABLE_NOTIFICATIONS !== 'true') {
      return next(new AppError('Los envíos de WhatsApp están apagados en este ambiente.', 503));
    }

    const { clientId, phone: directPhone, text, templateName, components } = req.body;
    const { tenantId, _id: senderId } = req.user;

    let client = null;
    let phone = directPhone;

    if (clientId) {
      client = await Client.findById(clientId);
      if (!client) return next(new AppError('Cliente no encontrado', 404));
      phone = client.whatsapp || client.phone;
    }

    if (!phone) return next(new AppError('Se requiere un número de teléfono o ID de cliente', 400));

    // If no client provided but we have phone, try to find one
    if (!client) {
      const last10Digits = phone.toString().slice(-10);
      client = await Client.findOne({ phone: { $regex: last10Digits } });
    }

    const company = await Company.findOne({ tenantId });
    const waConfig = company?.integrations?.whatsappConnectedAt ? {
      accessToken: company.integrations.whatsappAccessToken,
      phoneNumberId: company.integrations.whatsappPhoneId,
      wabaId: company.integrations.whatsappWabaId
    } : {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      wabaId: process.env.WHATSAPP_WABA_ID
    };

    let result;
    if (templateName) {
      result = await whatsappService.sendTemplateMessage(waConfig, phone, templateName, 'es', components);
    } else {
      result = await whatsappService.sendTextMessage(waConfig, phone, text);
    }

    const waId = whatsappService.formatPhoneNumber(phone);

    // Update conversation and store message
    let conv = await Conversation.findOne({ waId, tenantId });
    if (!conv) {
      conv = await Conversation.create({
        tenantId,
        clientId: client?._id,
        waId: waId,
        lastMessage: text || `Plantilla: ${templateName}`
      });
    } else {
      // Link client if not linked yet
      if (!conv.clientId && client?._id) {
        conv.clientId = client._id;
      }
      conv.lastMessage = text || `Plantilla: ${templateName}`;
      await conv.save();
    }

    const message = await Message.create({
      conversationId: conv._id,
      tenantId,
      waId: result.messages?.[0]?.id,
      direction: 'outbound',
      type: templateName ? 'template' : 'text',
      body: text || `Enviado plantilla: ${templateName}`,
      senderId,
      status: 'sent'
    });

    res.status(200).json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
};

/**
 * Get chat history
 */
export const getChatHistory = async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { tenantId } = req.user;

    const conv = await Conversation.findOne({ clientId, tenantId });
    if (!conv) {
      return res.status(200).json({ success: true, data: [] });
    }

    // Reset unread count when opening chat
    conv.unreadCount = 0;
    await conv.save();

    const messages = await Message.find({ conversationId: conv._id, tenantId })
      .sort({ createdAt: 1 })
      .limit(100);

    res.status(200).json({ success: true, data: messages });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all active conversations for the tenant
 */
export const getConversations = async (req, res, next) => {
  try {
    const { tenantId } = req.user;

    const conversations = await Conversation.find({ tenantId })
      .populate('clientId', 'fullName email phone whatsapp')
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, data: conversations });
  } catch (error) {
    next(error);
  }
};

export const getConfig = async (req, res, next) => {
  try {
    res.status(200).json({ success: true, data: { appId: process.env.META_APP_ID } });
  } catch (error) {
    next(error);
  }
};

export const getTemplates = async (req, res, next) => {
  try {
    const company = await Company.findOne({ tenantId: req.user.tenantId });
    const waConfig = company?.integrations?.whatsappConnectedAt ? {
      accessToken: company.integrations.whatsappAccessToken,
      phoneNumberId: company.integrations.whatsappPhoneId,
      wabaId: company.integrations.whatsappWabaId
    } : {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      wabaId: process.env.WHATSAPP_WABA_ID
    };
    const templates = await whatsappService.getTemplates(waConfig);
    res.status(200).json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
};
/**
 * Create a new template
 */
export const createTemplate = async (req, res, next) => {
  try {
    const company = await Company.findOne({ tenantId: req.user.tenantId });
    const waConfig = company?.integrations?.whatsappConnectedAt ? {
      accessToken: company.integrations.whatsappAccessToken,
      phoneNumberId: company.integrations.whatsappPhoneId,
      wabaId: company.integrations.whatsappWabaId
    } : {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      wabaId: process.env.WHATSAPP_WABA_ID
    };
    const result = await whatsappService.createTemplate(waConfig, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a template
 */
export const deleteTemplate = async (req, res, next) => {
  try {
    const { name } = req.params;
    const company = await Company.findOne({ tenantId: req.user.tenantId });
    const waConfig = company?.integrations?.whatsappConnectedAt ? {
      accessToken: company.integrations.whatsappAccessToken,
      phoneNumberId: company.integrations.whatsappPhoneId,
      wabaId: company.integrations.whatsappWabaId
    } : {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      wabaId: process.env.WHATSAPP_WABA_ID
    };
    const result = await whatsappService.deleteTemplate(waConfig, name);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const connect = async (req, res, next) => {
  try {
    const { code, wabaId: passedWabaId, phoneNumberId: passedPhoneNumberId } = req.body;
    const { tenantId } = req.user;
    
    // Determine the company for this tenant
    const company = await Company.findOne({ tenantId });
    if (!company) return next(new AppError('Empresa no encontrada', 404));

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) {
      return next(new AppError('META_APP_ID y META_APP_SECRET son requeridos en el servidor', 500));
    }

    let accessToken;
    const isAccessToken = code.startsWith('EA');
    if (isAccessToken) {
      accessToken = code;
    } else {
      const tokenRes = await fetch(
        `${GRAPH_API_URL}/oauth/access_token?${new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          code,
        }).toString()}`
      );
      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        return next(new AppError(`Error de autenticación: ${tokenData.error.message}`, 400));
      }
      accessToken = tokenData.access_token;
    }

    let wabaId = passedWabaId || '';
    let phoneNumberId = passedPhoneNumberId || '';
    let displayPhoneNumber = '';
    let verifiedName = '';

    // Simplified Fallback logic
    if (!wabaId || !phoneNumberId || wabaId === phoneNumberId) {
      try {
        const debugRes = await fetch(`${GRAPH_API_URL}/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`);
        const debugData = await debugRes.json();
        if (debugData.data?.granular_scopes) {
          for (const scope of debugData.data.granular_scopes) {
            if (scope.scope === 'whatsapp_business_management' && scope.target_ids?.length) {
              wabaId = scope.target_ids[0];
            }
            if (scope.scope === 'whatsapp_business_messaging' && scope.target_ids?.length) {
              phoneNumberId = scope.target_ids[0];
            }
          }
        }
      } catch (err) {}
    }

    if (!wabaId || !phoneNumberId || wabaId === phoneNumberId) {
       try {
         const wabaRes = await fetch(`${GRAPH_API_URL}/me?fields=whatsapp_business_accounts`, { headers: { Authorization: `Bearer ${accessToken}` } });
         const wabaData = await wabaRes.json();
         const accounts = wabaData.whatsapp_business_accounts?.data || wabaData.data;
         if (accounts && accounts.length > 0) {
           if (!wabaId || wabaId === phoneNumberId) wabaId = accounts[0].id;
           const phoneRes = await fetch(`${GRAPH_API_URL}/${wabaId}/phone_numbers?fields=display_phone_number,verified_name,id`, { headers: { Authorization: `Bearer ${accessToken}` } });
           const phoneData = await phoneRes.json();
           if (phoneData.data && phoneData.data.length > 0) {
             phoneNumberId = phoneData.data[0].id;
           }
         }
       } catch (err) {}
    }

    if (phoneNumberId) {
      try {
        const phoneRes = await fetch(`${GRAPH_API_URL}/${phoneNumberId}?fields=display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${accessToken}` } });
        const phoneData = await phoneRes.json();
        if (phoneData.display_phone_number) {
          displayPhoneNumber = phoneData.display_phone_number;
          verifiedName = phoneData.verified_name || '';
        }
      } catch (err) {}
    }

    if (!wabaId || !phoneNumberId) {
      return next(new AppError('No se pudo identificar tu cuenta o número de WhatsApp.', 400));
    }

    // Subscribe to webhooks
    try {
      await fetch(`${GRAPH_API_URL}/${wabaId}/subscribed_apps`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
    } catch(err) {}

    company.integrations = {
      ...(company.integrations || {}),
      whatsappEnabled: true,
      whatsappWabaId: wabaId,
      whatsappPhoneId: phoneNumberId,
      whatsappAccessToken: accessToken,
      whatsappDisplayPhone: displayPhoneNumber,
      whatsappVerifiedName: verifiedName,
      whatsappConnectedAt: new Date(),
    };
    await company.save();

    res.status(200).json({ success: true, data: { wabaId, phoneNumberId, displayPhoneNumber, verifiedName } });
  } catch (error) {
    next(error);
  }
};

export const disconnect = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const company = await Company.findOne({ tenantId });
    if (!company) return next(new AppError('Empresa no encontrada', 404));

    company.integrations = {
      ...(company.integrations || {}),
      whatsappEnabled: false,
      whatsappWabaId: undefined,
      whatsappPhoneId: undefined,
      whatsappAccessToken: undefined,
      whatsappDisplayPhone: undefined,
      whatsappVerifiedName: undefined,
      whatsappConnectedAt: undefined,
    };
    await company.save();

    res.status(200).json({ success: true, message: 'Desconectado exitosamente' });
  } catch (error) {
    next(error);
  }
};
