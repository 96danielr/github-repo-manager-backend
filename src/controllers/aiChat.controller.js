import { aiChatService } from '../services/aiChat/aiChat.service.js';

/**
 * Controller for AI-powered data queries.
 * Restricted to admins as per requirements.
 */
export const askAI = async (req, res, next) => {
  try {
    const { question, history } = req.body;
    const { tenantId, companyId } = req.user;

    if (!question) {
      return res.status(400).json({ success: false, message: 'Pregunta faltante' });
    }

    // Establecer cabeceras para streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await aiChatService.askStream(
      question, 
      history || [],
      tenantId, 
      companyId,
      (token) => {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      },
      (metadata) => {
        res.write(`data: ${JSON.stringify({ metadata })}\n\n`);
      }
    );

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    // Si hay error durante el stream, enviamos un evento de error
    console.error('Streaming error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
};
