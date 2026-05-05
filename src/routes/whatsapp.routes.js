import express from 'express';
import { 
  verifyWebhook, 
  handleWebhook, 
  getChatHistory, 
  getConversations,
  getTemplates,
  createTemplate,
  deleteTemplate,
  sendMessage
} from '../controllers/whatsapp.controller.js';
import { protect } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const router = express.Router();

// Public Webhook routes (called by Meta)
router.get('/webhook', verifyWebhook);
router.post('/webhook', handleWebhook);

// Protected routes (called by CRM)
router.use(protect);
router.use(tenantMiddleware);

router.get('/conversations', getConversations);
router.get('/templates', getTemplates);
router.post('/templates', createTemplate);
router.delete('/templates/:name', deleteTemplate);
router.get('/history/:clientId', getChatHistory);
router.post('/send', sendMessage);

export default router;
