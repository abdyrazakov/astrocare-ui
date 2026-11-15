import { describe, expect, it } from 'vitest';
import { buildMockTick, levelRank, scenarioTick } from './brainMock';
import { parseTick } from '@/types/brain';
import { ZONE_IDS } from '@/types/health';

describe('scenarioTick — replay of real astro-brain v0.6 samples', () => {
  it('cycles green → yellow → red over its 120-tick period', () => {
    expect(scenarioTick(0).alertLevel).toBe('green');
    expect(scenarioTick(45).alertLevel).toBe('yellow');
    expect(scenarioTick(85).alertLevel).toBe('red');
    expect(scenarioTick(120).alertLevel).toBe('green'); // loops
  });

  it('every tick is a real brain sample validating against the live schema', () => {
    for (const i of [0, 20, 45, 65, 85, 105]) {
      const tick = scenarioTick(i);
      expect(parseTick(JSON.parse(JSON.stringify(tick)))).not.toBeNull();
    }
  });

  it('carries the full v0.6 contract, not just the base fields', () => {
    const red = scenarioTick(85);
    expect(red.bodySystems).toBeDefined();
    expect(red.flagDetails).toBeDefined();
    expect(red.likelyConditions).toBeDefined();
    expect(red.plans?.exercise).toBeDefined();
    expect(red.plans?.nutrition).toBeDefined();
    expect(red.doctorSource).toBeDefined();
  });

  it('stamps seq and a fresh timestamp per call', () => {
    const a = scenarioTick(7);
    const b = scenarioTick(8);
    expect(a.seq).toBe(7);
    expect(b.seq).toBe(8);
  });
});

describe('buildMockTick — offline fallback also carries the v0.6 shape', () => {
  it('attaches bodySystems derived from the same triage result for every zone', () => {
    const t = buildMockTick({ astronautId: 'astro-01', day: 53, seq: 1 });
    expect(t.alertLevel).toBe('red');
    expect(t.bodySystems).toBeDefined();
    for (const z of ZONE_IDS) expect(t.bodySystems?.[z]).toBeDefined();
    expect(t.bodySystems?.lungs).toBe('red');
  });

  it('marks doctorSource as fallback (local rule-based engine, not an LLM)', () => {
    const t = buildMockTick({ astronautId: 'astro-01', day: 53, seq: 1 });
    expect(t.doctorSource).toBe('fallback');
  });

  it('still validates against the live BrainTickSchema', () => {
    const t = buildMockTick({ astronautId: 'astro-01', day: 53, seq: 1 });
    expect(parseTick(JSON.parse(JSON.stringify(t)))).not.toBeNull();
  });
});

describe('levelRank', () => {
  it('orders green < yellow < red', () => {
    expect(levelRank('green')).toBeLessThan(levelRank('yellow'));
    expect(levelRank('yellow')).toBeLessThan(levelRank('red'));
  });
});
