'use client';
import { useEffect, useMemo, useState } from 'react';
import { useHealthStore } from '@/store/useHealthStore';
import { astronautById } from '@/data/astronauts';
import { effectiveLog, effectiveHistory } from '@/lib/simulator';
import { triage } from '@/lib/triageEngine';
import { allScores } from '@/lib/scores';
import { ZONE_IDS, type TriageStatus, type ZoneId } from '@/types/health';
import { envById } from '@/lib/environments';
import { zoneLevels } from '@/lib/zoneLevels';

export function useNow(intervalMs = 500) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export type Freshness = 'fresh' | 'delayed' | 'lost';
export function freshnessOf(lastTickAt: number | null, now: number): { state: Freshness; ageSec: number } {
  if (!lastTickAt) return { state: 'lost', ageSec: Infinity };
  const ageSec = (now - lastTickAt) / 1000;
  return { state: ageSec > 15 ? 'lost' : ageSec > 5 ? 'delayed' : 'fresh', ageSec };
}

/** All derived data for the selected astronaut/day: effective log, triage, scores, live-merged zone status. */
export function useDashboard() {
  const astronautId = useHealthStore((s) => s.astronautId);
  const day = useHealthStore((s) => s.day);
  const envId = useHealthStore((s) => s.envId);
  const whatIfs = useHealthStore((s) => s.whatIfs);
  const override = useHealthStore((s) => s.overrides[`${s.astronautId}:${s.day}`]);
  const ticks = useHealthStore((s) => s.ticks);
  const lastTickAt = useHealthStore((s) => s.lastTickAt);
  const now = useNow(1000);

  const astronaut = astronautById(astronautId);
  const env = envById(envId);
  const log = useMemo(() => effectiveLog(astronautId, day, envId, override, whatIfs), [astronautId, day, envId, override, whatIfs]);
  const history = useMemo(() => effectiveHistory(astronautId, day, envId), [astronautId, day, envId]);
  const result = useMemo(() => triage(astronaut, log, history), [astronaut, log, history]);
  const scores = useMemo(() => allScores(astronaut, log, result), [astronaut, log, result]);

  const tick = ticks[ticks.length - 1] ?? null;
  const fresh = freshnessOf(lastTickAt, now);

  const zoneStatus = useMemo(() => {
    const fallback = {} as Record<ZoneId, TriageStatus>;
    for (const z of ZONE_IDS) fallback[z] = result.zones[z].status;
    const liveTick = fresh.state !== 'lost' ? tick : null;
    return zoneLevels(liveTick, fallback);
  }, [result, tick, fresh.state]);

  return { astronaut, env, log, history, result, scores, tick, fresh, zoneStatus, now };
}
