import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  waId: { // WhatsApp Message ID from Meta
    type: String,
    unique: true,
    sparse: true
  },
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'document', 'template', 'button'],
    default: 'text'
  },
  body: {
    type: String,
    required: true
  },
  mediaUrl: {
    type: String
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed', 'received'],
    default: 'sent'
  },
  senderId: { // Admin user who sent the message, if outbound
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

const Message = mongoose.model('Message', messageSchema);

export default Message;
