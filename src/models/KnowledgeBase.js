import mongoose from 'mongoose';

const knowledgeBaseSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  pregunta: {
    type: String,
    required: [true, 'La pregunta es requerida'],
    trim: true,
  },
  respuesta: {
    type: String,
    required: [true, 'La respuesta es requerida'],
    trim: true,
  },
  keywords: {
    type: [String],
    default: [],
  },
  categoria: {
    type: String,
    enum: {
      values: ['pagos', 'documentos', 'cuotas', 'general'],
      message: 'Categoría no válida',
    },
    default: 'general',
  },
  activo: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

knowledgeBaseSchema.index({ tenantId: 1, companyId: 1 });
knowledgeBaseSchema.index({ tenantId: 1, companyId: 1, categoria: 1 });
knowledgeBaseSchema.index({ pregunta: 'text', respuesta: 'text', keywords: 'text' });

knowledgeBaseSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

const KnowledgeBase = mongoose.model('KnowledgeBase', knowledgeBaseSchema);

export default KnowledgeBase;
