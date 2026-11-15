import { z } from 'zod';
import { ZONE_IDS } from './health';

/** Contract of the backend "brain": one JSON message per tick over WebSocket. Extended fields are optional. */
export const FlagSchema = z.object({
  type: z.enum(['vitals', 'radiation', 'exercise', 'nutrition', 'sleep', 'mood']),
  severity: z.enum(['warning', 'critical']),
  reason: z.string(),
  triggeredValue: z.number(),
  metric: z.string().optional(),
  zone: z.enum(ZONE_IDS).optional(),
  threshold: z.number().optional(),
  unit: z.string().optional(),
  normalRange: z.tuple([z.number(), z.number()]).optional(),
  deviationPct: z.number().optional(),
  sustainedSec: z.number().optional(),
});

export const StepSchema = z.object({
  text: z.string(),
  durationMin: z.number().optional(),
  escalation: z.boolean().optional(),
});

/** v0.6: brain → UI zone colours. Unknown zone keys are dropped rather than failing the whole tick. */
export const BodySystemsSchema = z.preprocess((val) => {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const allowed = new Set<string>(ZONE_IDS);
    return Object.fromEntries(Object.entries(val as Record<string, unknown>).filter(([k]) => allowed.has(k)));
  }
  return val;
}, z.record(z.enum(ZONE_IDS), z.enum(['green', 'yellow', 'red'])));

export const FlagDetailSchema = z.object({
  code: z.string(),
  severity: z.enum(['yellow', 'red']),
  message: z.string(),
  value: z.number().nullable(),
  threshold: z.number().nullable(),
  evidenceRef: z.string().nullable(),
});

export const ConditionResourceSchema = z.object({
  code: z.string(),
  name: z.string().optional(),
  category: z.string().optional(),
  onboard: z.boolean().nullable(),
  essentialUnits: z.object({ best: z.number(), worst: z.number() }).optional(),
});

export const OnboardCapabilitySchema = z.object({
  status: z.enum(['full', 'partial', 'none', 'unknown', 'no_rt']),
  missing: z.array(z.string()),
});

export const LikelyConditionSchema = z.object({
  code: z.string(),
  label: z.string(),
  confidence: z.number().min(0).max(1),
  drivers: z.array(z.string()),
  evidenceRef: z.string().nullable().optional(),
  phaseAdjusted: z.boolean().optional(),
  resources: z.array(ConditionResourceSchema).optional(),
  onboardCapability: OnboardCapabilitySchema.optional(),
});

export const ExerciseSessionSchema = z.object({
  type: z.string(),
  minutes: z.number(),
  note: z.string().optional(),
});

export const ExercisePlanSchema = z.object({
  status: z.enum(['normal', 'reduced', 'cancelled']),
  reason: z.string(),
  sessions: z.array(ExerciseSessionSchema),
  targetMinutes: z.number(),
  evidenceRef: z.string().optional(),
});

export const NutritionPlanSchema = z.object({
  status: z.enum(['normal', 'increase', 'monitor']),
  targetKcal: z.number().nullable(),
  advice: z.array(z.string()).optional(),
  hydration: z.string(),
  evidenceRef: z.string().optional(),
});

export const PlansSchema = z.object({
  exercise: ExercisePlanSchema,
  nutrition: NutritionPlanSchema,
});

export const BrainTickSchema = z.object({
  timestamp: z.string(),
  alertLevel: z.enum(['green', 'yellow', 'red']),
  activeFlags: z.array(FlagSchema),
  rawVitals: z
    .object({
      hr: z.number(),
      spo2: z.number(),
      temp_c: z.number(),
      resp_rate: z.number(),
      radiation_dose_rate: z.number(),
      bp_sys: z.number().optional(),
      bp_dia: z.number().optional(),
      glucose_mgdl: z.number().optional(),
      radiation_cumulative_msv: z.number().optional(),
    })
    .catchall(z.number().optional()),
  doctorRecommendation: z.string(),
  seq: z.number().optional(),
  astronautId: z.string().optional(),
  missionDay: z.number().optional(),
  environment: z.string().optional(),
  steps: z.array(StepSchema).optional(),
  radiation_cumulative_msv: z.number().optional(),
  // v0.6 brain contract — additive, all optional so pre-v0.6 ticks still parse.
  news2Score: z.number().optional(),
  doctorSource: z.enum(['llm', 'cache', 'fallback']).optional(),
  bodySystems: BodySystemsSchema.optional(),
  flagDetails: z.array(FlagDetailSchema).optional(),
  likelyConditions: z.array(LikelyConditionSchema).optional(),
  plans: PlansSchema.optional(),
  medicalKit: z.array(z.string()).optional(),
  missionPhase: z.string().optional(),
});

export type BrainFlag = z.infer<typeof FlagSchema>;
export type BrainStep = z.infer<typeof StepSchema>;
export type BodySystems = z.infer<typeof BodySystemsSchema>;
export type FlagDetail = z.infer<typeof FlagDetailSchema>;
export type ConditionResource = z.infer<typeof ConditionResourceSchema>;
export type OnboardCapability = z.infer<typeof OnboardCapabilitySchema>;
export type LikelyCondition = z.infer<typeof LikelyConditionSchema>;
export type ExercisePlan = z.infer<typeof ExercisePlanSchema>;
export type NutritionPlan = z.infer<typeof NutritionPlanSchema>;
export type Plans = z.infer<typeof PlansSchema>;
export type BrainTick = z.infer<typeof BrainTickSchema>;
export type AlertLevel = BrainTick['alertLevel'];
export type DoctorSource = NonNullable<BrainTick['doctorSource']>;

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

export function parseTick(raw: unknown): BrainTick | null {
  const r = BrainTickSchema.safeParse(raw);
  if (!r.success) {
    // eslint-disable-next-line no-console
    console.warn('[brain] malformed tick ignored', r.error.issues.slice(0, 3));
    return null;
  }
  return r.data;
}
