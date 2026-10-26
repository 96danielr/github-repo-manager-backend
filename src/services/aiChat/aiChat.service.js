import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import mongoose from 'mongoose';
import { COLLECTIONS_SCHEMA } from './schemaContext.js';
import { validateQuery, convertObjectIds } from './queryValidator.js';
import AppError from '../../utils/AppError.js';

export class AIChatService {
  /** True when GEMINI_API_KEY is set; without it the API still starts and the assistant answers 503. */
  get isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  // The Gemini client is created on first use, because creating it without a key throws at import time.
  get model() {
    if (!this._model) {
      if (!this.isConfigured) {
        throw new AppError('El asistente de IA no está configurado en este ambiente.', 503);
      }
      this._model = new ChatGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
        model: "gemini-3.1-flash-lite-preview",
        maxOutputTokens: 2048,
        temperature: 0, // Determinístico para mayor seguridad en queries
      });
    }
    return this._model;
  }

  /**
   * Genera y ejecuta una consulta basada en lenguaje natural.
   */
  async ask(question, history = [], tenantId, companyId) {
    try {
      // 1. Generar la especificación de la consulta (Pipeline de MongoDB)
      const querySpec = await this._generateQuerySpec(question, history);
      
      console.log('--- AI GENERATED QUERY ---');
      console.log('Collection:', querySpec.collection);
      console.log('Pipeline:', JSON.stringify(querySpec.pipeline, null, 2));

      // 2. Validar y Saneamiento (Capa de seguridad crítica)
      const validatedSpec = validateQuery(querySpec, tenantId, companyId);
      
      console.log('--- VALIDATED & SECURED QUERY ---');
      console.log('Final Pipeline:', JSON.stringify(validatedSpec.pipeline, null, 2));
      console.log('---------------------------');

      // 3. Ejecutar la consulta en la base de datos
      const rawResults = await this._executePipeline(validatedSpec);
      const results = this._sanitizeResults(rawResults);

      // 4. Generar respuesta final interpretando los resultados
      const interpretation = await this._interpretResults(question, results, history);

      return {
        question,
        answer: interpretation.text,
        type: interpretation.type, // 'text' | 'table'
        tableData: interpretation.type === 'table' ? results : undefined,
        columns: interpretation.columns,
        // En desarrollo o debug podríamos querer ver el pipeline generado
        _debug: process.env.NODE_ENV === 'development' ? validatedSpec : undefined
      };
    } catch (error) {
      console.error('AI Chat Error:', error);
      if (error.name === 'QueryValidationError') {
        throw new AppError(`Error de validación de consulta AI: ${error.message}`, 400);
      }
      throw new AppError('Error al procesar la pregunta con AI', 500);
    }
  }

  /**
   * Versión con streaming para una experiencia fluida.
   */
  async askStream(question, history = [], tenantId, companyId, onToken, onMetadata) {
    // 1. Generar Pipeline (O detectar si falta información)
    const querySpec = await this._generateQuerySpec(question, history);
    
    if (querySpec.clarify) {
      onToken(querySpec.clarify);
      return;
    }

    const validatedSpec = validateQuery(querySpec, tenantId, companyId);
    
    // 2. Ejecutar DB (Esto es atómico)
    const rawResults = await this._executePipeline(validatedSpec);
    const results = this._sanitizeResults(rawResults);
 
    // 3. Preparar la interpretación
    if (!results || results.length === 0) {
      onToken("No encontré información relevante con esos filtros.");
      return;
    }
 
    // Enviamos primero la metadata de la tabla si existe
    const isTable = results.length > 1;
    onMetadata({
      type: isTable ? 'table' : 'text',
      tableData: isTable ? results : undefined,
      columns: isTable ? Object.keys(results[0]).filter(k => !k.startsWith('_')) : [],
      suggestedFilename: querySpec.suggestedFilename
    });

    const prompt = PromptTemplate.fromTemplate(`
      Eres un asistente experto en análisis de ventas inmobiliarias y gestión de cobranza.
      
      HISTORIAL DE CONVERSACIÓN:
      {history}

      CONTEXTO DE DATOS (Resultados de DB):
      {results}

      INSTRUCCIONES DE RESPUESTA:
      1. Responde a la pregunta: "{question}"
      2. Usa **negritas** para resaltar cifras clave, nombres de clientes o estados importantes.
      3. Si enumeras elementos, usa listas con viñetas o números.
      4. Usa saltos de línea (\n) para separar párrafos y que sea fácil de leer.
      5. Mantén un tono ejecutivo, profesional y amable.
      6. Si los resultados son un listado, menciona explícitamente que has preparado una tabla detallada abajo.
      7. No vuelvas a preguntar por datos que el usuario ya proporcionó en el historial.
      8. SEGURIDAD: NUNCA menciones IDs técnicos (ObjectIds, tenantId, companyId) ni contraseñas en tu respuesta. Si necesitas referenciar algo, usa su nombre, código de lote o identificación humana.

      RESPUESTA:
    `);

    // Usamos el modelo para streamear la respuesta final
    const stream = await prompt.pipe(this.model).pipe(new StringOutputParser()).stream({
      question,
      results: JSON.stringify(results.slice(0, 5)),
      history: history.map(h => `${h.role === 'user' ? 'Usuario' : 'Asistente'}: ${h.content}`).join('\n') || "No hay mensajes previos."
    });

    for await (const chunk of stream) {
      if (chunk) {
        onToken(chunk);
      }
    }
  }

  async _generateQuerySpec(question, history = []) {
    const historyText = history.map(h => `${h.role === 'user' ? 'Usuario' : 'Asistente'}: ${h.content}`).join('\n');

    const prompt = PromptTemplate.fromTemplate(`
      Eres un experto en MongoDB y analista de datos para un sistema de cobranza inmobiliaria.
      Tu tarea es convertir una pregunta del usuario en un pipeline de agregación de MongoDB.

      DATOS DE LA BASE DE DATOS (ESQUEMA):
      {schema}

      HISTORIAL DE CONVERSACIÓN (Para contexto):
      {history}

      INSTRUCCIONES:
      1. Genera un JSON estrictamente válido. No incluyas explicaciones ni markdown fuera del bloque JSON.
      2. Si la pregunta del usuario es VAGA o AMBIGUA (ej: "quiero un reporte", "dame ventas"), o si el historial indica que falta información que el usuario aún no proporciona, NO generes un pipeline. En su lugar, responde con este JSON:
         {{
           "clarify": "Mensaje amable pidiendo los filtros necesarios (ej: año, vendedor, proyecto)"
         }}
      3. Importante: Revisa el HISTORIAL. Si el usuario ya proporcionó un dato (ej: un periodo, un proyecto), úsalo aunque no esté en la PREGUNTA ACTUAL.
      4. Si la pregunta es clara, genera este JSON:
         {{
           "collection": "nombre_de_la_colección",
           "pipeline": [ ... etapas de agregación ... ],
           "suggestedFilename": "Nombre_Descriptivo_Archivo"
         }}
      5. Usa $match para filtrar.
      6. Si necesitas unir datos (ej: contrato con cliente), usa $lookup.
      7. La primera etapa del pipeline DEBE ser un $match (incluso si está vacío, el validador lo completará con seguridad).
      8. No asumas IDs, usa nombres de campos del esquema.
      9. SEGURIDAD: Evita proyectar campos sensibles como 'tenantId', 'companyId' o contraseñas si no son necesarios para el cálculo. El sistema filtrará estos campos automáticamente al final, pero es mejor evitar su selección si es posible.

      PREGUNTA ACTUAL DEL USUARIO: "{question}"

      RESPUESTA JSON:
    `);

    const chain = prompt.pipe(this.model).pipe(new StringOutputParser());

    const response = await chain.invoke({
      schema: COLLECTIONS_SCHEMA,
      history: historyText || "No hay mensajes previos.",
      question: question
    });

    // Limpiar respuesta (a veces el modelo añade ```json ... ```)
    const cleanedResponse = response.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      return JSON.parse(cleanedResponse);
    } catch (e) {
      console.error('Failed to parse AI response:', cleanedResponse);
      throw new Error('La IA generó una consulta con formato inválido');
    }
  }

  async _executePipeline({ collection, pipeline }) {
    // Obtener el modelo dinámicamente de mongoose
    const Model = mongoose.model(this._capitalize(collection.slice(0, -1))); // Ej: lots -> Lot, clients -> Client
    
    // Note: slice(0,-1) es una simplificación, en producción usaríamos un mapeo explícito
    const collectionModelMap = {
      'lots': 'Lot',
      'clients': 'Client',
      'contracts': 'Contract',
      'quotas': 'Quota',
      'payments': 'Payment',
      'users': 'User'
    };
    
    const modelName = collectionModelMap[collection];
    if (!modelName) throw new Error(`Modelo no mapeado para colección: ${collection}`);
    
    const TargetModel = mongoose.model(modelName);

    // Convertir strings que parecen ObjectIds a ObjectIds reales de Mongoose
    const hydratedPipeline = convertObjectIds(pipeline);

    return await TargetModel.aggregate(hydratedPipeline);
  }

  async _interpretResults(question, results, history = []) {
    if (!results || results.length === 0) {
      return {
        type: 'text',
        text: "No encontré información que responda exactamente a tu pregunta en los registros actuales.",
      };
    }

    const historyText = history.map(h => `${h.role === 'user' ? 'Usuario' : 'Asistente'}: ${h.content}`).join('\n');

    const prompt = PromptTemplate.fromTemplate(`
      Eres un asistente experto en análisis de ventas inmobiliarias.
      Basado en los resultados de la base de datos y el historial de la conversación, determina si la respuesta debe ser un texto simple o una tabla de datos.

      HISTORIAL DE CONVERSACIÓN:
      {history}

      REGLAS:
      1. Si los resultados son un listado de múltiples items (ej: contratos, clientes, lotes), usa type: "table".
      2. Si los resultados son un solo valor (ej: un conteo, un total, un promedio), usa type: "text".
      3. RESPONDE ÚNICAMENTE CON UN JSON VÁLIDO. No incluyas explicaciones fuera del JSON.
      4. SEGURIDAD: NUNCA incluyas campos técnicos como 'tenantId', 'companyId', '_id' o '__v' en el array de 'columns'. Estos deben ser excluidos de la vista del usuario.

      FORMATO DE RESPUESTA:
      {{
        "type": "text" | "table",
        "text": "Resumen narrativo corto de lo que se encontró",
        "columns": ["columna1", "columna2"] // Solo si el tipo es tabla
      }}

      Pregunta: {question}
      Resultados (JSON): {results}

      Respuesta JSON:
    `);

    const chain = prompt.pipe(this.model).pipe(new StringOutputParser());

    const response = await chain.invoke({
      question: question,
      results: JSON.stringify(results.slice(0, 15)), // Un poco más de contexto
      history: historyText || "No hay mensajes previos."
    });

    const cleanedResponse = response.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      return JSON.parse(cleanedResponse);
    } catch (e) {
      return {
        type: results.length > 1 ? 'table' : 'text',
        text: response,
        columns: results.length > 0 ? Object.keys(results[0]).filter(k => !k.startsWith('_')) : []
      };
    }
  }

  _sanitizeResults(results) {
    if (!results || !Array.isArray(results)) return results;
    
    // Lista de campos que NUNCA deben viajar al frontend ni ser procesados por la IA en su interpretación final
    const sensitiveFields = [
      'tenantId', 
      'companyId', 
      '_id', 
      '__v', 
      'password', 
      'token', 
      'secret',
      'hash'
    ];
    
    return results.map(item => {
      const sanitized = { ...item };
      sensitiveFields.forEach(field => delete sanitized[field]);
      
      // También sanitizar objetos anidados recursivamente si existen (ej: de un $lookup)
      for (const key in sanitized) {
        if (typeof sanitized[key] === 'object' && sanitized[key] !== null && !(sanitized[key] instanceof Date)) {
          if (Array.isArray(sanitized[key])) {
            sanitized[key] = this._sanitizeResults(sanitized[key]);
          } else {
            sanitized[key] = this._sanitizeResults([sanitized[key]])[0];
          }
        }
      }
      
      return sanitized;
    });
  }

  _capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}

export const aiChatService = new AIChatService();
