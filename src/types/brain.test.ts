import { describe, expect, it } from 'vitest';
import { parseTick } from './brain';
import nominal from '@/data/brainSamples/nominal.json';
import sepsisLike from '@/data/brainSamples/sepsis_like.json';
import hypercapnia from '@/data/brainSamples/hypercapnia.json';
import radiationStorm from '@/data/brainSamples/radiation_storm.json';
import sleepDeprivation from '@/data/brainSamples/sleep_deprivation.json';
import hypovolemiaLike from '@/data/brainSamples/hypovolemia_like.json';

const SAMPLES: Record<string, unknown> = {
  nominal, sepsis_like: sepsisLike, hypercapnia, radiation_storm: radiationStorm,
  sleep_deprivation: sleepDeprivation, hypovolemia_like: hypovolemiaLike,
};

describe('BrainTickSchema — real astro-brain v0.6 samples', () => {
  for (const [name, raw] of Object.entries(SAMPLES)) {
    it(`parses the real ${name} brain tick`, () => {
      const tick = parseTick(raw);
      expect(tick).not.toBeNull();
      expect(tick?.alertLevel).toBeDefined();
      expect(tick?.bodySystems).toBeDefined();
      expect(tick?.flagDetails).toBeDefined();
      expect(tick?.plans?.exercise).toBeDefined();
      expect(tick?.plans?.nutrition).toBeDefined();
    });
  }

  it('keeps the doctorSource enum from the real ticks', () => {
    const tick = parseTick(nominal);
    expect(['llm', 'cache', 'fallback']).toContain(tick?.doctorSource);
  });

  it('carries likelyConditions with resources and onboardCapability on the sepsis-like tick', () => {
    const tick = parseTick(sepsisLike);
    expect(tick?.likelyConditions?.length).toBeGreaterThan(0);
    const first = tick!.likelyConditions![0];
    expect(first.code).toBeTruthy();
    expect(typeof first.confidence).toBe('number');
    expect(Array.isArray(first.resources)).toBe(true);
    expect(first.onboardCapability?.status).toBeDefined();
  });

  it('still parses a pre-v0.6 minimal tick (no extended fields)', () => {
    const minimal = {
      timestamp: '2026-11-14T10:00:00Z',
      alertLevel: 'green',
      activeFlags: [],
      rawVitals: { hr: 70, spo2: 98, temp_c: 36.9, resp_rate: 14, radiation_dose_rate: 0.5 },
      doctorRecommendation: 'All nominal.',
    };
    const tick = parseTick(minimal);
    expect(tick).not.toBeNull();
    expect(tick?.bodySystems).toBeUndefined();
    expect(tick?.news2Score).toBeUndefined();
    expect(tick?.doctorSource).toBeUndefined();
  });

  it('tolerates an unknown zone key inside bodySystems instead of failing the whole tick', () => {
    const withUnknownZone = {
      ...(nominal as Record<string, unknown>),
      bodySystems: { ...(nominal as { bodySystems: Record<string, string> }).bodySystems, some_future_zone: 'red' },
    };
    const tick = parseTick(withUnknownZone);
    expect(tick).not.toBeNull();
    expect(tick?.bodySystems).toBeDefined();
    expect((tick?.bodySystems as Record<string, string>)?.some_future_zone).toBeUndefined();
    expect(tick?.bodySystems?.brain).toBe('green');
  });

  it('rejects a tick with a malformed core field (unchanged pre-v0.6 behaviour)', () => {
    const tick = parseTick({ timestamp: 1, alertLevel: 'purple', activeFlags: 'nope' });
    expect(tick).toBeNull();
  });
});
