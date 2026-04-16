import mongoose from 'mongoose';
import {
  ALLOWED_COLLECTIONS,
  FORBIDDEN_STAGES,
  MAX_LIMIT,
  MAX_PIPELINE_STAGES,
} from './schemaContext.js';

/**
 * AI Chat Query Validator
 * 
 * Multi-layer validation to ensure generated MongoDB pipelines
 * are safe, read-only, and scoped to the user's tenant/company.
 *
 * Validation layers:
 * 1. Structure validation (must be array, valid JSON)
 * 2. Stage whitelist (no write operations)
 * 3. Collection whitelist (only allowed collections)
 * 4. Depth/complexity limits
 * 5. Tenant/company isolation enforcement
 * 6. Limit enforcement
 * 7. Dangerous pattern detection (code injection, $where, etc)
 */

/**
 * Dangerous patterns that should NEVER appear in a pipeline
 */
const DANGEROUS_PATTERNS = [
  /\$where/i,
  /\$function/i,
  /\$accumulator/i,
  /\$expr.*\$function/i,
  /eval\s*\(/i,
  /process\./i,
  /require\s*\(/i,
  /import\s*\(/i,
  /globalThis/i,
  /constructor/i,
  /__proto__/i,
  /prototype/i,
  /\$currentOp/i,
  /\$listSessions/i,
  /mapReduce/i,
  /db\.\w+\.\w+/i,      // db.collection.operation patterns
  /sleep\s*\(/i,
  /while\s*\(/i,
  /for\s*\(/i,
];

/**
 * Validates the raw pipeline string for dangerous patterns
 * before even parsing as JSON.
 */
function validateRawString(pipelineStr) {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(pipelineStr)) {
      throw new QueryValidationError(
        `Patrón peligroso detectado: ${pattern.source}`,
        'DANGEROUS_PATTERN'
      );
    }
  }
}

/**
 * Custom error class for query validation
 */
export class QueryValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'QueryValidationError';
    this.code = code;
  }
}

/**
 * Main validation function.
 * 
 * @param {Object} querySpec - The query specification from the LLM
 * @param {string} querySpec.collection - Target collection name
 * @param {Array} querySpec.pipeline - MongoDB aggregation pipeline
 * @param {string} tenantId - The tenant ID to enforce
 * @param {string} companyId - The company ID to enforce
 * @returns {Object} - Validated & sanitized { collection, pipeline }
 */
export function validateQuery(querySpec, tenantId, companyId) {
  // ── 1. Basic structure validation ──
  if (!querySpec || typeof querySpec !== 'object') {
    throw new QueryValidationError(
      'La especificación de consulta debe ser un objeto',
      'INVALID_STRUCTURE'
    );
  }

  const { collection, pipeline } = querySpec;

  // ── 2. Collection validation ──
  if (!collection || typeof collection !== 'string') {
    throw new QueryValidationError(
      'Se requiere el nombre de la colección',
      'MISSING_COLLECTION'
    );
  }

  if (!ALLOWED_COLLECTIONS.includes(collection.toLowerCase())) {
    throw new QueryValidationError(
      `Colección "${collection}" no permitida. Colecciones disponibles: ${ALLOWED_COLLECTIONS.join(', ')}`,
      'FORBIDDEN_COLLECTION'
    );
  }

  // ── 3. Pipeline structure validation ──
  if (!Array.isArray(pipeline)) {
    throw new QueryValidationError(
      'El pipeline debe ser un array',
      'INVALID_PIPELINE'
    );
  }

  if (pipeline.length === 0) {
    throw new QueryValidationError(
      'El pipeline no puede estar vacío',
      'EMPTY_PIPELINE'
    );
  }

  if (pipeline.length > MAX_PIPELINE_STAGES) {
    throw new QueryValidationError(
      `El pipeline excede el máximo de ${MAX_PIPELINE_STAGES} stages`,
      'TOO_MANY_STAGES'
    );
  }

  // ── 4. Raw string check for injection patterns ──
  const pipelineStr = JSON.stringify(pipeline);
  validateRawString(pipelineStr);

  // ── 5. Stage-level validation ──
  for (let i = 0; i < pipeline.length; i++) {
    const stage = pipeline[i];

    if (typeof stage !== 'object' || stage === null || Array.isArray(stage)) {
      throw new QueryValidationError(
        `Stage ${i} no es un objeto válido`,
        'INVALID_STAGE'
      );
    }

    const stageKeys = Object.keys(stage);

    if (stageKeys.length !== 1) {
      throw new QueryValidationError(
        `Stage ${i} debe tener exactamente una clave de operación`,
        'INVALID_STAGE'
      );
    }

    const stageOp = stageKeys[0];

    // Check forbidden stages
    if (FORBIDDEN_STAGES.includes(stageOp)) {
      throw new QueryValidationError(
        `Operación "${stageOp}" no permitida. Solo consultas de lectura.`,
        'FORBIDDEN_STAGE'
      );
    }

    // Validate $lookup references only allowed collections
    if (stageOp === '$lookup') {
      const lookupFrom = stage.$lookup?.from;
      if (lookupFrom && !ALLOWED_COLLECTIONS.includes(lookupFrom.toLowerCase())) {
        throw new QueryValidationError(
          `$lookup a colección "${lookupFrom}" no permitida`,
          'FORBIDDEN_LOOKUP'
        );
      }
    }
  }

  // ── 6. Enforce tenant/company isolation ──
  // The first $match MUST include tenantId and companyId
  const sanitizedPipeline = enforceTenantIsolation(pipeline, tenantId, companyId);

  // ── 7. Enforce limit ──
  const finalPipeline = enforceLimit(sanitizedPipeline);

  return {
    collection: collection.toLowerCase(),
    pipeline: finalPipeline,
  };
}

/**
 * Ensures the pipeline starts with a $match that includes
 * tenantId and companyId, overwriting any provided values
 * to prevent tenant data leakage.
 */
function enforceTenantIsolation(pipeline, tenantId, companyId) {
  const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
  const companyObjectId = new mongoose.Types.ObjectId(companyId);

  const securityMatch = {
    tenantId: tenantObjectId,
    companyId: companyObjectId,
  };

  const newPipeline = [...pipeline];

  // Check if first stage is already $match
  if (newPipeline[0] && newPipeline[0].$match) {
    // Remove any tenantId/companyId the LLM may have set (we override)
    const existingMatch = { ...newPipeline[0].$match };
    delete existingMatch.tenantId;
    delete existingMatch.companyId;

    // Merge security filters with existing match conditions
    newPipeline[0] = {
      $match: {
        ...securityMatch,
        ...existingMatch,
      },
    };
  } else {
    // Insert security $match at the beginning
    newPipeline.unshift({ $match: securityMatch });
  }

  // Also enforce tenantId/companyId in any $lookup pipeline
  for (let i = 0; i < newPipeline.length; i++) {
    if (newPipeline[i].$lookup?.pipeline) {
      const lookupPipeline = newPipeline[i].$lookup.pipeline;
      // Prepend tenant filter to lookup sub-pipeline
      const lookupMatch = {
        $match: {
          $expr: {
            $and: [
              { $eq: ['$tenantId', tenantObjectId] },
              { $eq: ['$companyId', companyObjectId] },
            ],
          },
        },
      };
      
      if (lookupPipeline[0]?.$match) {
        // Merge with existing match
        const existing = lookupPipeline[0].$match;
        lookupPipeline[0].$match = {
          ...lookupMatch.$match,
          ...existing,
        };
      } else {
        lookupPipeline.unshift(lookupMatch);
      }
    }
  }

  return newPipeline;
}

/**
 * Ensures the pipeline ends with a $limit stage.
 * If one exists, clamp it to MAX_LIMIT.
 * If none exists, append one.
 */
function enforceLimit(pipeline) {
  const newPipeline = [...pipeline];
  const lastStage = newPipeline[newPipeline.length - 1];

  if (lastStage?.$limit !== undefined) {
    // Clamp existing limit
    newPipeline[newPipeline.length - 1] = {
      $limit: Math.min(lastStage.$limit, MAX_LIMIT),
    };
  } else {
    // Check if there's a $limit anywhere
    const limitIdx = newPipeline.findIndex(s => s.$limit !== undefined);
    if (limitIdx >= 0) {
      newPipeline[limitIdx] = {
        $limit: Math.min(newPipeline[limitIdx].$limit, MAX_LIMIT),
      };
    } else {
      // No limit found, append one
      newPipeline.push({ $limit: MAX_LIMIT });
    }
  }

  return newPipeline;
}

/**
 * Recursively converts string ObjectIds in the pipeline to proper ObjectId instances.
 * Only converts strings that look like valid 24-char hex ObjectIds.
 */
export function convertObjectIds(obj) {
  if (typeof obj === 'string' && /^[0-9a-fA-F]{24}$/.test(obj)) {
    return new mongoose.Types.ObjectId(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(convertObjectIds);
  }

  if (obj && typeof obj === 'object' && !(obj instanceof mongoose.Types.ObjectId) && !(obj instanceof Date)) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertObjectIds(value);
    }
    return result;
  }

  return obj;
}
