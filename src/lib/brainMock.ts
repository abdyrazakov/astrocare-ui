import { parseTick, type AlertLevel, type BodySystems, type BrainFlag, type BrainTick, type FlagDetail, type Plans } from '@/types/brain';
import type { DailyTelemetryLog, Metric, MetricId, TriageResult, ZoneId } from '@/types/health';
import { ZONE_IDS } from '@/types/health';
import { astronautById } from '@/data/astronauts';
import { getLog, getHistory } from '@/data/generator';
import { triage, STATUS_RANK } from './triageEngine';
import { getProtocol } from './protocols';
import { effectiveLog, effectiveHistory, type Overrides, type WhatIfId } from './simulator';
import type { EnvironmentId } from './environments';
import nominalSample from '@/data/brainSamples/nominal.json';
import sleepDeprivationSample from '@/data/brainSamples/sleep_deprivation.json';
import hypovolemiaLikeSample from '@/data/brainSamples/hypovolemia_like.json';
import sepsisLikeSample from '@/data/brainSamples/sepsis_like.json';
import hypercapniaSample from '@/data/brainSamples/hypercapnia.json';
import radiationStormSample from '@/data/brainSamples/radiation_storm.json';

/**
 * Mock "brain": produces ticks with EXACTLY the backend contract, computed by the local triage engine.
 * Used in-browser when no WebSocket backend is reachable, and by scripts/mock-brain.ts.
 */

const FLAG_TYPE: Partial<Record<MetricId, BrainFlag['type']>> = {
  radiationMsvDay: 'radiation', cumulativeDoseMsv: 'radiation',
  sleepHours: 'sleep', sleepEfficiency: 'sleep', pvtWorst10Ms: 'sleep', mfi: 'sleep',
  mood: 'mood', stressVas: 'mood',
  kcalIntake: 'nutrition', proteinG: 'nutrition', bodyMassKg: 'nutrition', hydrationMl: 'nutrition',
  exerciseMinutes: 'exercise', resistanceMinutes: 'exercise',
};

/** Thresholds for absolute metrics (for "value vs threshold" display). */
const ABS_THRESHOLDS: Partial<Record<MetricId, { yellow: number; red: number; normal: [number, number] }>> = {
  ppCO2: { yellow: 3.0, red: 7.6, normal: [0, 2.5] },
  spo2: { yellow: 94, red: 90, normal: [96, 100] },
  radiationMsvDay: { yellow: 1, red: 5, normal: [0, 0.7] },
  motionSickness: { yellow: 4, red: 7, normal: [0, 3] },
  hydrationMl: { yellow: 2000, red: 1200, normal: [2500, 4000] },
  bmdLossRatePctMonth: { yellow: 1.0, red: 1.5, normal: [0, 1.0] },
  exerciseMinutes: { yellow: 45, red: 0, normal: [90, 180] },
  resistanceMinutes: { yellow: 20, red: 0, normal: [30, 60] },
  mfi: { yellow: 30, red: 65, normal: [0, 30] },
  opticDiscEdema: { yellow: 1, red: 1, normal: [0, 0] },
};

const ZONE_PRIORITY: ZoneId[] = ['lungs', 'heart', 'brain', 'skin_immune', 'eyes', 'pancreas', 'kidneys', 'inner_ear', ...ZONE_IDS];

function metricToFlag(m: Metric, zone: ZoneId): BrainFlag {
  const sev = m.status === 'red' ? 'critical' : 'warning';
  let threshold: number | undefined;
  let normalRange: [number, number] | undefined;
  if (m.baseline) {
    const k = m.status === 'red' ? 3 : 1.5;
    const up = (m.zScore ?? 0) > 0;
    threshold = Math.round((m.baseline.mean + (up ? k : -k) * m.baseline.sd) * 10) / 10;
    normalRange = [Math.round((m.baseline.mean - 1.5 * m.baseline.sd) * 10) / 10, Math.round((m.baseline.mean + 1.5 * m.baseline.sd) * 10) / 10];
  } else {
    const t = ABS_THRESHOLDS[m.id];
    if (t) { threshold = m.status === 'red' ? t.red : t.yellow; normalRange = t.normal; }
  }
  return {
    type: FLAG_TYPE[m.id] ?? 'vitals', severity: sev, reason: m.reason ?? m.label,
    triggeredValue: m.value, metric: m.id, zone, threshold, unit: m.unit, normalRange,
    deviationPct: m.deviationPct != null ? Math.round(m.deviationPct * 10) / 10 : undefined,
  };
}

/** Map the local triage engine's per-zone status onto the v0.6 `bodySystems` shape (no data / stale → green). */
function localBodySystems(t: TriageResult): BodySystems {
  const out = {} as Record<ZoneId, 'green' | 'yellow' | 'red'>;
  for (const z of ZONE_IDS) {
    const s = t.zones[z].status;
    out[z] = s === 'red' ? 'red' : s === 'yellow' ? 'yellow' : 'green';
  }
  return out;
}

/** Map the already-computed brain-contract flags onto the v0.6 `flagDetails` shape. */
function localFlagDetails(flags: BrainFlag[]): FlagDetail[] {
  return flags.map((f) => ({
    code: (f.metric ?? f.type).toUpperCase(),
    severity: f.severity === 'critical' ? 'red' : 'yellow',
    message: f.reason,
    value: f.triggeredValue ?? null,
    threshold: f.threshold ?? null,
    evidenceRef: null,
  }));
}

/** Deterministic local approximation of the brain's exercise/nutrition plan — not the real planning logic. */
function localPlans(level: AlertLevel): Plans {
  if (level === 'red') {
    return {
      exercise: { status: 'cancelled', reason: 'Exercise is cancelled while a critical flag is active (offline fallback).', sessions: [], targetMinutes: 150 },
      nutrition: { status: 'monitor', targetKcal: null, hydration: 'increase fluids and monitor urine output' },
    };
  }
  if (level === 'yellow') {
    return {
      exercise: { status: 'reduced', reason: 'Reduce workload while active flags are monitored (offline fallback).', sessions: [{ type: 'resistive', minutes: 75, note: 'Reduced session; reassess before continuing.' }], targetMinutes: 150 },
      nutrition: { status: 'monitor', targetKcal: null, hydration: 'normal hydration' },
    };
  }
  return {
    exercise: {
      status: 'normal', reason: 'Continue the planned ARED and aerobic schedule.', targetMinutes: 150,
      sessions: [{ type: 'resistive', minutes: 45, note: 'ARED/resistive session.' }, { type: 'aerobic', minutes: 30, note: 'Aerobic conditioning.' }],
    },
    nutrition: { status: 'normal', targetKcal: null, hydration: 'normal hydration' },
  };
}

export function tickFromTriage(t: TriageResult, log: DailyTelemetryLog, seq: number, env?: string): BrainTick {
  const seen = new Set<string>();
  const flags: BrainFlag[] = [];
  for (const z of ZONE_PRIORITY) {
    for (const m of t.zones[z].metrics) {
      if (m.status === 'green' || m.status === 'stale' || seen.has(m.id)) continue;
      seen.add(m.id);
      flags.push(metricToFlag(m, z));
    }
  }
  flags.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));

  const worstZone = ZONE_PRIORITY.find((z) => t.zones[z].status === t.overall && t.overall !== 'green');
  const proto = worstZone ? getProtocol(t.zones[worstZone].protocolId) : null;
  const alertLevel = t.overall === 'stale' ? 'green' : t.overall;
  const doctorRecommendation = proto
    ? `${proto.title}. ${proto.steps[0].text} ${proto.steps[1]?.text ?? ''}`.trim()
    : 'All parameters within your personal baseline. Continue the planned schedule and stay hydrated.';

  return {
    seq, astronautId: log.astronautId, missionDay: log.missionDay, environment: env,
    timestamp: new Date().toISOString(),
    alertLevel,
    activeFlags: flags,
    rawVitals: {
      hr: log.hr, spo2: log.spo2, temp_c: log.coreTemp, resp_rate: log.respRate,
      radiation_dose_rate: log.radiationMsvDay, bp_sys: log.sbp, bp_dia: log.dbp, glucose_mgdl: log.glucose,
      radiation_cumulative_msv: log.cumulativeDoseMsv,
    },
    doctorRecommendation,
    steps: proto?.steps.map((s) => ({ text: s.text, durationMin: s.durationMin, escalation: s.isEscalation })),
    radiation_cumulative_msv: log.cumulativeDoseMsv,
    // v0.6 contract fields — local approximation, computed from the same triage result, so the offline
    // mock exercises the full brain contract even while no backend is connected.
    doctorSource: 'fallback',
    bodySystems: localBodySystems(t),
    flagDetails: localFlagDetails(flags),
    likelyConditions: [],
    plans: localPlans(alertLevel),
  };
}

export interface MockContext {
  astronautId: string;
  day: number;
  seq: number;
  envId?: EnvironmentId;
  overrides?: Overrides;
  whatIfs?: WhatIfId[];
  jitter?: boolean;
}

const jit = (v: number, amp: number, d = 0) => Math.round((v + (Math.random() * 2 - 1) * amp) * 10 ** d) / 10 ** d;

export function buildMockTick(ctx: MockContext): BrainTick {
  const a = astronautById(ctx.astronautId);
  let log = ctx.envId ? effectiveLog(ctx.astronautId, ctx.day, ctx.envId, ctx.overrides, ctx.whatIfs) : getLog(ctx.astronautId, ctx.day);
  if (ctx.jitter) {
    log = { ...log, hr: jit(log.hr, 1.2), coreTemp: jit(log.coreTemp, 0.05, 1), respRate: jit(log.respRate, 0.6),
      radiationMsvDay: jit(log.radiationMsvDay, log.radiationMsvDay * 0.04, 2), glucose: jit(log.glucose, 1) };
  }
  const hist = ctx.envId ? effectiveHistory(ctx.astronautId, ctx.day, ctx.envId) : getHistory(ctx.astronautId, ctx.day);
  return tickFromTriage(triage(a, log, hist), log, ctx.seq, ctx.envId);
}

/**
 * Scripted replay for the standalone mock server: real astro-brain v0.6 ticks (src/data/brainSamples,
 * generated in Task 1 by actually running the brain) replayed green → yellow → red, looping every
 * `REPLAY_PERIOD` ticks. Unlike the hand-interpolated vitals this replaced, every tick carries the
 * full v0.6 contract (bodySystems, flagDetails, likelyConditions, plans, news2Score, doctorSource).
 */
function sample(raw: unknown): BrainTick {
  const t = parseTick(raw);
  if (!t) throw new Error('[brainMock] bundled brain sample failed to validate against BrainTickSchema');
  return t;
}

const GREEN_SAMPLES: BrainTick[] = [sample(nominalSample)];
const YELLOW_SAMPLES: BrainTick[] = [sample(sleepDeprivationSample), sample(hypovolemiaLikeSample)];
const RED_SAMPLES: BrainTick[] = [sample(sepsisLikeSample), sample(hypercapniaSample), sample(radiationStormSample)];

const REPLAY_PERIOD = 120;
const REPLAY_PHASE = REPLAY_PERIOD / 3; // 40 ticks green, 40 yellow, 40 red
const ROTATE_EVERY = 5; // ticks before cycling to the next sample within a severity bucket

function bucketFor(t: number): BrainTick[] {
  if (t < REPLAY_PHASE) return GREEN_SAMPLES;
  if (t < REPLAY_PHASE * 2) return YELLOW_SAMPLES;
  return RED_SAMPLES;
}

export function scenarioTick(i: number): BrainTick {
  const t = i % REPLAY_PERIOD;
  const bucket = bucketFor(t);
  const base = bucket[Math.floor(t / ROTATE_EVERY) % bucket.length];
  return { ...base, seq: i, timestamp: new Date().toISOString(), environment: 'iss' };
}

export const levelRank = (l: BrainTick['alertLevel']) => STATUS_RANK[l];
