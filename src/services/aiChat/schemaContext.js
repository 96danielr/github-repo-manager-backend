/**
 * Schema context for the AI Chat system.
 * Describes the MongoDB collections and their fields so the LLM
 * can generate accurate Mongoose aggregation pipelines.
 *
 * IMPORTANT: Only READ-ONLY collections relevant to sales/cobranza
 * are exposed here. Never expose sensitive fields (passwords, tokens, etc).
 */

export const COLLECTIONS_SCHEMA = `
## Colecciones disponibles en MongoDB (Mongoose)

### lots (Inventario de inmuebles: lotes, casas, apartamentos, locales)
- _id: ObjectId
- tenantId: ObjectId (referencia a Tenant)
- companyId: ObjectId (referencia a Company)
- stage: String (etapa del proyecto)
- manzana: String (manzana o bloque)
- nomenclature: String (nomenclatura)
- lotNumber: String (número de identificación de la unidad)
- area: Number (metros cuadrados)
- price: Number (precio del inmueble)
- status: String (enum: "disponible", "vendido", "apartado")
- propertyType: String (enum: "lotes", "casas", "apartamentos", "locales")
- tower: String (torre, solo para apartamentos)
- floor: String (piso, solo para apartamentos)
- sellerId: ObjectId (referencia a User, vendedor asignado)
- createdAt: Date
- updatedAt: Date

### clients (Clientes)
- _id: ObjectId
- tenantId: ObjectId
- companyId: ObjectId
- name: String (nombre del cliente)
- idNumber: String (número de identificación / cédula)
- phone: String (teléfono)
- email: String (correo electrónico)
- behavior: String (comportamiento de pago)
- createdAt: Date
- updatedAt: Date

### contracts (Contratos / Ventas)
- _id: ObjectId
- tenantId: ObjectId
- companyId: ObjectId
- client: ObjectId (referencia a Client)
- lot: ObjectId (referencia a Lot)
- sellerId: ObjectId (referencia a User)
- contractDate: Date (fecha del contrato)
- negotiation: String (tipo de negociación)
- appendix: String (apéndice)
- totalValue: Number (valor total de la venta)
- initialQuotaPercentage: Number (porcentaje cuota inicial)
- initialQuotasCount: Number (cantidad cuotas iniciales)
- installmentsCount: Number (cantidad de cuotas normales)
- installmentValue: Number (valor de cada cuota)
- paymentDay: Number (día de pago mensual)
- startDate: Date (fecha inicio de pagos)
- bonus: String (bono / descuento)
- bonusValue: Number (valor del bono)
- commercial: String (nombre del asesor comercial)
- recaudadoSiigo2024: Number (recaudado en Siigo 2024)
- recaudadoSiigo2025: Number (recaudado en Siigo 2025)
- juridicalRequirement: String (requerimiento jurídico)
- observations: String (observaciones)
- createdAt: Date
- updatedAt: Date

### quotas (Cuotas)
- _id: ObjectId
- tenantId: ObjectId
- companyId: ObjectId
- contract: ObjectId (referencia a Contract)
- number: Number (número de cuota)
- type: String (enum: "inicial", "normal")
- value: Number (valor de la cuota)
- dueDate: Date (fecha de vencimiento)
- status: String (enum: "pendiente", "pagado", "mora")
- paymentBank: String (banco de pago)
- paymentDate: Date (fecha real de pago)
- paymentObservations: String (observaciones del pago)
- amountPaid: Number (monto pagado)
- createdAt: Date
- updatedAt: Date

### payments (Pagos reportados por clientes)
- _id: ObjectId
- tenantId: ObjectId
- companyId: ObjectId
- contractId: ObjectId (referencia a Contract)
- cuotaNumber: Number (número de cuota)
- amount: Number (monto pagado)
- banco: String (banco utilizado)
- fechaPago: Date (fecha del pago)
- status: String (enum: "PENDIENTE", "APROBADO", "RECHAZADO")
- observacion: String
- approvedAt: Date
- createdAt: Date
- updatedAt: Date

### users (Usuarios / Staff)
- _id: ObjectId
- tenantId: ObjectId
- companyId: ObjectId
- name: String (nombre completo)
- email: String
- document: String (número de identificación)
- role: String (ej: "admin", "seller")
- createdAt: Date

## Relaciones principales
- Un Contract pertenece a un Client y un Lot
- Un Contract tiene muchas Quotas (cuotas)
- Un Contract puede tener muchos Payments (pagos reportados)
- Todos los documentos están filtrados por tenantId y companyId

## Reglas para generar aggregation pipelines
1. SIEMPRE incluir filtro por tenantId y companyId como primer stage ($match)
2. Usar $lookup para hacer joins entre colecciones
3. SIEMPRE incluir $limit al final (máximo 100)
4. NUNCA generar operaciones de escritura ($set en la DB, $merge, $out)
5. El pipeline DEBE ser un array JSON válido
6. Para fechas usar new Date() o ISODate
7. Los ObjectId se representan como strings y serán convertidos automáticamente
`;

/**
 * The allowed collection names that can appear in queries
 */
export const ALLOWED_COLLECTIONS = [
  'lots',
  'clients',
  'contracts',
  'quotas',
  'payments',
  'users',
];

/**
 * MongoDB stages that are NEVER allowed (write operations)
 */
export const FORBIDDEN_STAGES = [
  '$out',
  '$merge',
  '$set',        // $set at pipeline level = $addFields (ok), but $set on collection = write
  '$unset',
  '$replaceRoot',
  '$replaceWith',
  '$currentOp',
  '$listSessions',
  '$planCacheStats',
  '$collStats',
  '$indexStats',
];

/**
 * Maximum number of documents that can be returned
 */
export const MAX_LIMIT = 100;

/**
 * Maximum pipeline stages allowed
 */
export const MAX_PIPELINE_STAGES = 12;
