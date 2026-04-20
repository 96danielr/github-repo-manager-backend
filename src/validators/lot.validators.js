import { z } from 'zod';

const isoDate = z.string().refine(val => !isNaN(Date.parse(val)), { message: 'La fecha del contrato debe ser una fecha válida' });

export const reserveLotValidation = z.object({
  body: z.object({
    type: z.enum(['apartado', 'separado'], { 
      required_error: 'El tipo de reserva debe ser "apartado" o "separado"', 
      invalid_type_error: 'El tipo de reserva debe ser "apartado" o "separado"' 
    }),
    clientId: z.string()
      .regex(/^[0-9a-fA-F]{24}$/, 'ID de cliente inválido')
      .optional(),
    clientData: z.record(z.string(), z.any()).optional(),
    amount: z.coerce.number({ invalid_type_error: 'El monto debe ser un número' })
      .optional()
  }).refine(data => {
    if (data.type === 'separado' && (!data.amount || data.amount < 500000)) {
      return false;
    }
    return true;
  }, {
    message: 'Para separar se requiere un monto mínimo de $500,000',
    path: ['amount']
  })
});

export const sellLotValidation = z.object({
  body: z.object({
    totalValue: z.coerce.number({ invalid_type_error: 'El valor total debe ser un número' })
      .optional(),
    installmentsCount: z.coerce.number()
      .int()
      .min(0, 'El número de cuotas debe ser un entero positivo')
      .optional(),
    initialQuotaPercentage: z.coerce.number()
      .min(0, 'El porcentaje de cuota inicial debe estar entre 0 y 100')
      .max(100, 'El porcentaje de cuota inicial debe estar entre 0 y 100')
      .optional(),
    contractDate: isoDate
      .optional()
  })
});

export const releaseLotValidation = z.object({
  body: z.object({
    reason: z.string({ required_error: 'La razón de liberación es obligatoria' })
      .min(1, 'La razón de liberación es obligatoria')
  })
});
