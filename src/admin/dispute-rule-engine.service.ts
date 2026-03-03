import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DisputeCategory } from '@prisma/client';

// ─────────────────────────────────────────────
//  Rule weights (tweak via env / config later)
// ─────────────────────────────────────────────
const WEIGHTS = {
  // Base severity by category
  category: {
    safety: 5,
    fraud: 5,
    pricing: 3,
    service: 2,
    cleanliness: 2,
  } as Record<DisputeCategory, number>,

  // Evidence quality
  evidence: {
    clearMediaPresent: 3,     // ≥1 image/video attached and quality_score ≥ 2
    multipleProofs: 2,        // ≥3 attachments
    textOnly: -2,             // no media at all
    lowQualityProof: -3,      // all media have quality_score 1
    duplicateEvidence: -4,    // content_hash found on another dispute
  },

  // Timing (hours since incident to filing)
  timing: {
    within2h: 3,
    within24h: 2,
    within48h: 0,
    after48h: -3,
    noTimestamp: -1,
  },

  // Customer (reporter) history
  customer: {
    frequentFalseComplaints: -5,   // ≥3 resolved-as-rejected disputes
    trustedReporter: 2,            // ≥3 resolved (approved) disputes, no false
    newUser: 0,
  },

  // Provider (driver / hotel) history
  provider: {
    previousComplaints: 2,         // ≥2 prior pending/resolved disputes
    repeatedSameCategory: 3,       // same category dispute against same provider
    cleanRecord: -2,               // 0 prior disputes
  },

  // Cross-verification
  crossVerification: {
    bookingTimeMatch: 2,           // incident_at within booking window
    multipleIndependentReporters: 2, // ≥2 distinct users filed against same provider in 30d
  },

  // Fraud signals (each applies a penalty)
  fraud: {
    duplicateDescriptionPattern: -3,
    rapidRepeatedFiling: -3,       // same user filed ≥3 disputes in 24h
    identicalHash: -5,             // same evidence hash used on another dispute
  },

  // Auto-action thresholds
  thresholds: {
    autoReject: 0,      // ≤0 → reject
    warning: 5,         // 1-5 → warning
    smallFine: 9,       // 6-9 → small fine
    heavyAction: 10,    // ≥10 → heavy fine or suspension
    manualReviewMin: 4, // scores in [4,7] with conflicting signals → flag
  },
};

export interface EvaluationResult {
  score: number;
  reasons: string[];
  flags: string[];
  recommendedAction: 'auto_rejected' | 'warning' | 'fine' | 'suspension_or_ban' | 'manual_review';
  breakdown: Record<string, number>;
}

export interface EvaluationContext {
  reporterUserId: number | null;
  incidentAt: Date | null;
  bookingStart: Date | null;
  bookingEnd: Date | null;
  providerId: number | null;          // driver.id or hotel.id
  providerType: 'driver' | 'hotel';
  newAttachments: Array<{
    file_type: string;
    content_hash: string | null;
    quality_score: number;
  }>;
  category: DisputeCategory;
  description: string;
}

@Injectable()
export class DisputeRuleEngineService {
  private readonly logger = new Logger(DisputeRuleEngineService.name);

  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────
  //  Main evaluation entry point
  // ─────────────────────────────────────────────────────────────────────────
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const reasons: string[] = [];
    const flags: string[] = [];
    const breakdown: Record<string, number> = {};
    let score = 0;

    // 1. Base category score
    const baseScore = WEIGHTS.category[ctx.category] ?? 2;
    score += baseScore;
    breakdown.category = baseScore;
    reasons.push(`Category "${ctx.category}" base score: +${baseScore}`);

    // 2. Evidence evaluation
    const evidenceScore = await this.scoreEvidence(ctx, reasons, flags);
    score += evidenceScore;
    breakdown.evidence = evidenceScore;

    // 3. Timing score
    const timingScore = this.scoreTiming(ctx, reasons, flags);
    score += timingScore;
    breakdown.timing = timingScore;

    // 4. Customer (reporter) history
    if (ctx.reporterUserId) {
      const customerScore = await this.scoreReporterHistory(ctx.reporterUserId, reasons, flags);
      score += customerScore;
      breakdown.customer_history = customerScore;
    }

    // 5. Provider history
    if (ctx.providerId) {
      const providerScore = await this.scoreProviderHistory(
        ctx.providerId,
        ctx.providerType,
        ctx.category,
        reasons,
        flags,
      );
      score += providerScore;
      breakdown.provider_history = providerScore;
    }

    // 6. Cross-verification
    const crossScore = await this.scoreCrossVerification(ctx, reasons, flags);
    score += crossScore;
    breakdown.cross_verification = crossScore;

    // 7. Fraud detection
    const fraudScore = await this.detectFraud(ctx, reasons, flags);
    score += fraudScore;
    breakdown.fraud_detection = fraudScore;

    // 8. Map score → recommended action
    const recommendedAction = this.mapScoreToAction(score, flags);

    this.logger.log(
      `Dispute evaluation complete: score=${score}, action=${recommendedAction}, flags=[${flags.join(', ')}]`,
    );

    return { score, reasons, flags, recommendedAction, breakdown };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Rule 2: Evidence quality
  // ─────────────────────────────────────────────────────────────────────────
  private async scoreEvidence(
    ctx: EvaluationContext,
    reasons: string[],
    flags: string[],
  ): Promise<number> {
    const { newAttachments, category } = ctx;

    if (newAttachments.length === 0) {
      // For safety/fraud categories, lack of evidence is a strong negative signal
      if (category === 'safety' || category === 'fraud') {
        flags.push('EVIDENCE_MISSING_FOR_SERIOUS_CATEGORY');
      }
      reasons.push('No evidence attached: -2');
      return WEIGHTS.evidence.textOnly;
    }

    let score = 0;
    const mediaAttachments = newAttachments.filter((a) =>
      a.file_type.startsWith('image/') || a.file_type.startsWith('video/'),
    );

    if (mediaAttachments.length === 0) {
      reasons.push('No image/video evidence: -2');
      return WEIGHTS.evidence.textOnly;
    }

    // Check for clear evidence (quality_score ≥ 2)
    const highQualityCount = mediaAttachments.filter((a) => a.quality_score >= 2).length;
    const lowQualityCount = mediaAttachments.filter((a) => a.quality_score === 1).length;

    if (highQualityCount > 0) {
      score += WEIGHTS.evidence.clearMediaPresent;
      reasons.push(`Clear image/video evidence found: +${WEIGHTS.evidence.clearMediaPresent}`);
    } else if (lowQualityCount === mediaAttachments.length) {
      score += WEIGHTS.evidence.lowQualityProof;
      reasons.push(`All evidence is low quality: ${WEIGHTS.evidence.lowQualityProof}`);
      flags.push('LOW_QUALITY_EVIDENCE');
    }

    if (newAttachments.length >= 3) {
      score += WEIGHTS.evidence.multipleProofs;
      reasons.push(`Multiple proofs (${newAttachments.length}): +${WEIGHTS.evidence.multipleProofs}`);
    }

    // Check for duplicate content_hash across other disputes
    const hashes = newAttachments
      .map((a) => a.content_hash)
      .filter((h): h is string => h !== null && h !== '');

    if (hashes.length > 0) {
      const existingWithSameHash = await this.prisma.disputeAttachment.findFirst({
        where: { content_hash: { in: hashes } },
      });

      if (existingWithSameHash) {
        score += WEIGHTS.evidence.duplicateEvidence;
        reasons.push(
          `Duplicate evidence hash found in another dispute: ${WEIGHTS.evidence.duplicateEvidence}`,
        );
        flags.push('DUPLICATE_EVIDENCE_HASH');
      }
    }

    return score;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Rule 3: Timing
  // ─────────────────────────────────────────────────────────────────────────
  private scoreTiming(
    ctx: EvaluationContext,
    reasons: string[],
    flags: string[],
  ): number {
    if (!ctx.incidentAt) {
      reasons.push('No incident timestamp provided: -1');
      return WEIGHTS.timing.noTimestamp;
    }

    const hoursAgo = (Date.now() - ctx.incidentAt.getTime()) / (1000 * 60 * 60);

    if (hoursAgo <= 2) {
      reasons.push(`Reported within 2h of incident: +${WEIGHTS.timing.within2h}`);
      return WEIGHTS.timing.within2h;
    }
    if (hoursAgo <= 24) {
      reasons.push(`Reported within 24h of incident: +${WEIGHTS.timing.within24h}`);
      return WEIGHTS.timing.within24h;
    }
    if (hoursAgo <= 48) {
      reasons.push('Reported within 48h of incident: +0');
      return WEIGHTS.timing.within48h;
    }

    // After 48h
    reasons.push(`Reported ${Math.round(hoursAgo)}h after incident: ${WEIGHTS.timing.after48h}`);
    flags.push('LATE_REPORT');
    return WEIGHTS.timing.after48h;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Rule 4: Reporter (customer) history
  // ─────────────────────────────────────────────────────────────────────────
  private async scoreReporterHistory(
    userId: number,
    reasons: string[],
    flags: string[],
  ): Promise<number> {
    const [rejectedCount, resolvedCount, totalCount] = await Promise.all([
      // disputes filed by this user that were rejected (false claims)
      this.prisma.dispute.count({
        where: {
          reporter_user_id: userId,
          status: 'rejected',
        },
      }),
      this.prisma.dispute.count({
        where: {
          reporter_user_id: userId,
          status: 'resolved',
        },
      }),
      this.prisma.dispute.count({
        where: { reporter_user_id: userId },
      }),
    ]);

    if (rejectedCount >= 3) {
      reasons.push(
        `Reporter has ${rejectedCount} rejected (false) complaints: ${WEIGHTS.customer.frequentFalseComplaints}`,
      );
      flags.push('FREQUENT_FALSE_REPORTER');
      return WEIGHTS.customer.frequentFalseComplaints;
    }

    if (resolvedCount >= 3 && rejectedCount === 0) {
      reasons.push(
        `Reporter has ${resolvedCount} successful complaints, no false ones: +${WEIGHTS.customer.trustedReporter}`,
      );
      return WEIGHTS.customer.trustedReporter;
    }

    reasons.push(`Reporter history: ${totalCount} total, ${resolvedCount} resolved, ${rejectedCount} rejected`);
    return WEIGHTS.customer.newUser;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Rule 5: Provider history
  // ─────────────────────────────────────────────────────────────────────────
  private async scoreProviderHistory(
    providerId: number,
    providerType: 'driver' | 'hotel',
    category: DisputeCategory,
    reasons: string[],
    flags: string[],
  ): Promise<number> {
    let priorDisputeCount = 0;
    let sameCategoryCount = 0;

    if (providerType === 'driver') {
      priorDisputeCount = await this.prisma.dispute.count({
        where: {
          bookingCar: { car: { driver_id: providerId } },
        },
      });
      sameCategoryCount = await this.prisma.dispute.count({
        where: {
          bookingCar: { car: { driver_id: providerId } },
          category,
        },
      });
    } else {
      // Hotel: disputes linked to any booking on hotels owned by this hotel manager
      priorDisputeCount = await this.prisma.dispute.count({
        where: {
          bookingHotel: {
            hotel: { manager: { id: providerId! } },
          },
        },
      });
      sameCategoryCount = await this.prisma.dispute.count({
        where: {
          bookingHotel: {
            hotel: { manager: { id: providerId! } },
          },
          category,
        },
      });
    }

    if (priorDisputeCount === 0) {
      reasons.push(`Provider has clean record (0 prior disputes): ${WEIGHTS.provider.cleanRecord}`);
      return WEIGHTS.provider.cleanRecord;
    }

    let score = 0;

    if (priorDisputeCount >= 2) {
      score += WEIGHTS.provider.previousComplaints;
      reasons.push(
        `Provider has ${priorDisputeCount} prior disputes: +${WEIGHTS.provider.previousComplaints}`,
      );
    }

    if (sameCategoryCount >= 2) {
      score += WEIGHTS.provider.repeatedSameCategory;
      reasons.push(
        `Provider has ${sameCategoryCount} prior "${category}" disputes (repeated pattern): +${WEIGHTS.provider.repeatedSameCategory}`,
      );
      flags.push('REPEATED_SAME_CATEGORY_AGAINST_PROVIDER');
    }

    return score;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Rule 6: Cross-verification
  // ─────────────────────────────────────────────────────────────────────────
  private async scoreCrossVerification(
    ctx: EvaluationContext,
    reasons: string[],
    flags: string[],
  ): Promise<number> {
    let score = 0;

    // a) Incident time within booking window
    if (ctx.incidentAt && ctx.bookingStart && ctx.bookingEnd) {
      const within = ctx.incidentAt >= ctx.bookingStart && ctx.incidentAt <= ctx.bookingEnd;
      if (within) {
        score += WEIGHTS.crossVerification.bookingTimeMatch;
        reasons.push(
          `Incident time falls within booking window: +${WEIGHTS.crossVerification.bookingTimeMatch}`,
        );
      } else {
        flags.push('INCIDENT_OUTSIDE_BOOKING_WINDOW');
        reasons.push('Incident time is OUTSIDE booking window — cross-verification failed');
      }
    }

    // b) Multiple independent reporters against same provider in last 30 days
    if (ctx.providerId) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      let recentCount = 0;

      if (ctx.providerType === 'driver') {
        recentCount = await this.prisma.dispute.count({
          where: {
            bookingCar: { car: { driver_id: ctx.providerId } },
            created_at: { gte: thirtyDaysAgo },
          },
        });
      } else {
        recentCount = await this.prisma.dispute.count({
          where: {
            bookingHotel: { hotel: { manager: { id: ctx.providerId! } } },
            created_at: { gte: thirtyDaysAgo },
          },
        });
      }

      if (recentCount >= 2) {
        score += WEIGHTS.crossVerification.multipleIndependentReporters;
        reasons.push(
          `${recentCount} independent complaints against this provider in last 30 days: +${WEIGHTS.crossVerification.multipleIndependentReporters}`,
        );
      }
    }

    return score;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Rule 7: Fraud detection
  // ─────────────────────────────────────────────────────────────────────────
  private async detectFraud(
    ctx: EvaluationContext,
    reasons: string[],
    flags: string[],
  ): Promise<number> {
    let score = 0;

    if (!ctx.reporterUserId) return 0;

    // a) Rapid repeated filings by same user in last 24h
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentFilings = await this.prisma.dispute.count({
      where: {
        reporter_user_id: ctx.reporterUserId,
        created_at: { gte: last24h },
      },
    });

    if (recentFilings >= 3) {
      score += WEIGHTS.fraud.rapidRepeatedFiling;
      reasons.push(
        `Reporter filed ${recentFilings} disputes in last 24h: ${WEIGHTS.fraud.rapidRepeatedFiling}`,
      );
      flags.push('RAPID_REPEATED_FILING');
    }

    // b) Near-duplicate description: check if this user filed a very similar description recently
    const recentByUser = await this.prisma.dispute.findMany({
      where: {
        reporter_user_id: ctx.reporterUserId,
        created_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { description: true },
      take: 20,
    });

    const currentDesc = ctx.description.toLowerCase().trim();
    for (const prev of recentByUser) {
      const similarity = this.descriptionSimilarity(currentDesc, prev.description.toLowerCase().trim());
      if (similarity > 0.85) {
        score += WEIGHTS.fraud.duplicateDescriptionPattern;
        reasons.push(
          `Complaint description is >${Math.round(similarity * 100)}% similar to a recent complaint: ${WEIGHTS.fraud.duplicateDescriptionPattern}`,
        );
        flags.push('DUPLICATE_DESCRIPTION_PATTERN');
        break; // apply once
      }
    }

    return score;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Map final score → recommended action
  // ─────────────────────────────────────────────────────────────────────────
  mapScoreToAction(
    score: number,
    flags: string[],
  ): EvaluationResult['recommendedAction'] {
    const hasHighSuspicion =
      flags.includes('FREQUENT_FALSE_REPORTER') ||
      flags.includes('RAPID_REPEATED_FILING') ||
      flags.includes('DUPLICATE_EVIDENCE_HASH');

    const hasConflictingSignals =
      flags.includes('LATE_REPORT') || flags.includes('INCIDENT_OUTSIDE_BOOKING_WINDOW');

    // Borderline & conflicting → always flag for manual review
    if (
      (score >= WEIGHTS.thresholds.manualReviewMin && score <= 7 && hasConflictingSignals) ||
      flags.includes('DUPLICATE_DESCRIPTION_PATTERN')
    ) {
      return 'manual_review';
    }

    if (hasHighSuspicion || score <= WEIGHTS.thresholds.autoReject) {
      return 'auto_rejected';
    }

    if (score <= WEIGHTS.thresholds.warning) {
      return 'warning';
    }

    if (score <= WEIGHTS.thresholds.smallFine) {
      return 'fine';
    }

    return 'suspension_or_ban';
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Simple Jaccard-based description similarity (no external libs)
  // ─────────────────────────────────────────────────────────────────────────
  private descriptionSimilarity(a: string, b: string): number {
    const tokenize = (s: string) => new Set(s.split(/\s+/).filter(Boolean));
    const setA = tokenize(a);
    const setB = tokenize(b);
    const intersection = [...setA].filter((t) => setB.has(t)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
  }
}
