import Limit from '../models/Limit.js';
import Usage from '../models/Usage.js';
import moment from 'moment';

class LimitService {
  /**
   * Generates the period value based on period type and date
   */
  getPeriodValue(periodType, date = new Date()) {
    const m = moment(date);
    switch (periodType) {
      case 'daily':
        return m.format('YYYY-MM-DD');
      case 'monthly':
        return m.format('YYYY-MM');
      case 'total':
        return 'forever';
      default:
        return 'forever';
    }
  }

  /**
   * Checks if the limits are exceeded for a given context
   * @returns {Object} { allowed: boolean, reason: string }
   */
  async checkLimit(context, feature) {
    const { userId, companyId, tenantId } = context;

    // Find all applicable active limits
    const applicableLimits = await Limit.find({
      feature,
      active: true,
      $or: [
        { targetType: 'user', targetId: userId },
        { targetType: 'company', targetId: companyId },
        { targetType: 'tenant', targetId: tenantId }
      ]
    });

    if (applicableLimits.length === 0) {
      // If no limits defined, we assume it's allowed (or we could have a default)
      return { allowed: true };
    }

    for (const limitConfig of applicableLimits) {
      const periodValue = this.getPeriodValue(limitConfig.period);
      
      const usage = await Usage.findOne({
        targetType: limitConfig.targetType,
        targetId: limitConfig.targetId,
        feature,
        periodType: limitConfig.period,
        periodValue
      });

      const currentCount = usage ? usage.count : 0;

      if (currentCount >= limitConfig.limit) {
        return {
          allowed: false,
          reason: `Límite de ${limitConfig.period} alcanzado para ${limitConfig.targetType} (${currentCount}/${limitConfig.limit})`,
          limitConfig
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Increments usage for all applicable levels
   */
  async incrementUsage(context, feature) {
    const { userId, companyId, tenantId } = context;

    // We increment usage for all levels that have a limit defined
    // AND we also probably want to track it anyway even if no limit is defined?
    // Let's increment for Tenant by default at least.

    const levels = [
      { type: 'user', id: userId },
      { type: 'company', id: companyId },
      { type: 'tenant', id: tenantId }
    ].filter(l => l.id);

    const periods = ['daily', 'monthly', 'total'];

    for (const level of levels) {
      for (const periodType of periods) {
        const periodValue = this.getPeriodValue(periodType);
        
        await Usage.findOneAndUpdate(
          {
            targetType: level.type,
            targetId: level.id,
            feature,
            periodType,
            periodValue
          },
          { $inc: { count: 1 } },
          { upsert: true, new: true }
        );
      }
    }
  }
}

export const limitService = new LimitService();
