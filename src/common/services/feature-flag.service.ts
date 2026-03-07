import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Feature flags for gradual rollout of new features
 * 
 * Configuration via environment variables:
 * - FEATURE_RIDE_HAILING_ENABLED=true|false (global toggle)
 * - FEATURE_RIDE_HAILING_ROLLOUT_PERCENTAGE=0-100 (gradual rollout)
 * - FEATURE_SURGE_PRICING_ENABLED=true|false
 */
@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);

  // Cache feature flags to avoid repeated config reads
  private readonly flags: Map<string, boolean> = new Map();
  
  // Users who are part of the beta/rollout group
  private readonly betaUsers: Set<number> = new Set();

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.initializeFlags();
  }

  private initializeFlags(): void {
    // Load feature flags from environment
    const rideHailingEnabled = this.configService.get('FEATURE_RIDE_HAILING_ENABLED', 'true') === 'true';
    const surgePricingEnabled = this.configService.get('FEATURE_SURGE_PRICING_ENABLED', 'true') === 'true';
    const metroCitiesEnabled = this.configService.get('FEATURE_METRO_CITIES_ENABLED', 'true') === 'true';

    this.flags.set('ride_hailing', rideHailingEnabled);
    this.flags.set('surge_pricing', surgePricingEnabled);
    this.flags.set('metro_cities', metroCitiesEnabled);

    this.logger.log(`Feature flags initialized: ride_hailing=${rideHailingEnabled}, surge_pricing=${surgePricingEnabled}`);
  }

  /**
   * Check if a feature is enabled globally
   */
  isFeatureEnabled(feature: string): boolean {
    return this.flags.get(feature) ?? false;
  }

  /**
   * Check if ride-hailing is enabled for a specific user
   * Supports gradual rollout based on user ID hash
   */
  async isRideHailingEnabledForUser(userId: number): Promise<boolean> {
    // Check global toggle first
    if (!this.isFeatureEnabled('ride_hailing')) {
      return false;
    }

    // Check if user is in beta group
    if (this.betaUsers.has(userId)) {
      return true;
    }

    // Check rollout percentage
    const rolloutPercentage = parseInt(
      this.configService.get('FEATURE_RIDE_HAILING_ROLLOUT_PERCENTAGE', '100'),
      10,
    );

    if (rolloutPercentage >= 100) {
      return true;
    }

    if (rolloutPercentage <= 0) {
      return false;
    }

    // Deterministic rollout based on user ID
    // This ensures the same user always gets the same result
    const userHash = userId % 100;
    return userHash < rolloutPercentage;
  }

  /**
   * Check if surge pricing should be applied
   */
  isSurgePricingEnabled(): boolean {
    return this.isFeatureEnabled('surge_pricing');
  }

  /**
   * Check if metropolitan area detection is enabled
   */
  isMetroCitiesEnabled(): boolean {
    return this.isFeatureEnabled('metro_cities');
  }

  /**
   * Add a user to the beta group
   */
  addBetaUser(userId: number): void {
    this.betaUsers.add(userId);
    this.logger.log(`User ${userId} added to beta group`);
  }

  /**
   * Remove a user from the beta group
   */
  removeBetaUser(userId: number): void {
    this.betaUsers.delete(userId);
    this.logger.log(`User ${userId} removed from beta group`);
  }

  /**
   * Get current feature flag status for monitoring
   */
  getFeatureStatus(): Record<string, any> {
    const rolloutPercentage = parseInt(
      this.configService.get('FEATURE_RIDE_HAILING_ROLLOUT_PERCENTAGE', '100'),
      10,
    );

    return {
      ride_hailing: {
        enabled: this.isFeatureEnabled('ride_hailing'),
        rollout_percentage: rolloutPercentage,
        beta_users_count: this.betaUsers.size,
      },
      surge_pricing: {
        enabled: this.isFeatureEnabled('surge_pricing'),
      },
      metro_cities: {
        enabled: this.isFeatureEnabled('metro_cities'),
      },
    };
  }

  /**
   * Update feature flag at runtime (for admin use)
   */
  setFeatureFlag(feature: string, enabled: boolean): void {
    this.flags.set(feature, enabled);
    this.logger.warn(`Feature flag '${feature}' set to ${enabled} at runtime`);
  }
}
