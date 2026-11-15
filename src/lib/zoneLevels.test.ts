import { describe, expect, it } from 'vitest';
import { zoneLevels } from './zoneLevels';
import { ZONE_IDS, type TriageStatus, type ZoneId } from '@/types/health';
import type { BrainTick } from '@/types/brain';
import nominal from '@/data/brainSamples/nominal.json';
import sepsisLike from '@/data/brainSamples/sepsis_like.json';
import { parseTick } from '@/types/brain';

const allGreen = () => Object.fromEntries(ZONE_IDS.map((z) => [z, 'green'])) as Record<ZoneId, TriageStatus>;

describe('zoneLevels', () => {
  it('returns the fallback unchanged when there is no tick', () => {
    const fallback = { ...allGreen(), heart: 'yellow' as TriageStatus };
    expect(zoneLevels(null, fallback)).toEqual(fallback);
  });

  it('is authoritative from tick.bodySystems when present, covering every ZONE_ID', () => {
    const tick = parseTick(sepsisLike)!;
    const result = zoneLevels(tick, allGreen());
    for (const z of ZONE_IDS) expect(result[z]).toBe(tick.bodySystems![z] ?? 'green');
    expect(result.heart).toBe('yellow');
    expect(result.lungs).toBe('yellow');
    expect(result.liver).toBe('green');
  });

  it('defaults a zone missing from bodySystems to green', () => {
    const tick = parseTick(nominal)!;
    const partial: BrainTick = { ...tick, bodySystems: { heart: 'red' } };
    const result = zoneLevels(partial, allGreen());
    expect(result.heart).toBe('red');
    expect(result.lungs).toBe('green');
  });

  it('falls back to the flagZone heuristic over the local triage status when bodySystems is absent', () => {
    const tick: BrainTick = {
      timestamp: '2026-11-14T10:00:00Z',
      alertLevel: 'red',
      activeFlags: [{ type: 'vitals', severity: 'critical', reason: 'HR high', triggeredValue: 140, metric: 'hr', zone: 'heart' }],
      rawVitals: { hr: 140, spo2: 98, temp_c: 37, resp_rate: 16, radiation_dose_rate: 0.5 },
      doctorRecommendation: 'Rest.',
    };
    const fallback = allGreen();
    const result = zoneLevels(tick, fallback);
    expect(result.heart).toBe('red');
    expect(result.lungs).toBe('green');
  });

  it('never downgrades the fallback status when the flag overlay is weaker', () => {
    const tick: BrainTick = {
      timestamp: '2026-11-14T10:00:00Z',
      alertLevel: 'yellow',
      activeFlags: [{ type: 'vitals', severity: 'warning', reason: 'HR elevated', triggeredValue: 100, metric: 'hr', zone: 'heart' }],
      rawVitals: { hr: 100, spo2: 98, temp_c: 37, resp_rate: 16, radiation_dose_rate: 0.5 },
      doctorRecommendation: 'Monitor.',
    };
    const fallback = { ...allGreen(), heart: 'red' as TriageStatus };
    const result = zoneLevels(tick, fallback);
    expect(result.heart).toBe('red');
  });
});
