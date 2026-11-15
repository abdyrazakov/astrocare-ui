import type { BrainTick } from '@/types/brain';
import { ZONE_IDS, type TriageStatus, type ZoneId } from '@/types/health';
import { worst } from './triageEngine';
import { zoneForFlag } from './flagZone';

/**
 * Single source of truth for per-zone colour, shared by Twin3D, Twin2D, BodyPanel and useDashboard.
 *
 * When the live tick carries `bodySystems` (brain v0.6+), it is authoritative: every ZONE_ID takes
 * the brain's green/yellow/red level directly — no local computation. When it is absent (older brain,
 * no connection yet, or an offline fallback tick), `fallback` (the local triage engine's per-zone
 * status) is used, overlaid with the `flagZone.ts` heuristic mapping of `tick.activeFlags` onto zones —
 * exactly the behaviour this app had before the v0.6 contract.
 */
export function zoneLevels(tick: BrainTick | null, fallback: Record<ZoneId, TriageStatus>): Record<ZoneId, TriageStatus> {
  if (tick?.bodySystems) {
    const out = {} as Record<ZoneId, TriageStatus>;
    for (const z of ZONE_IDS) out[z] = tick.bodySystems[z] ?? 'green';
    return out;
  }
  const out = { ...fallback };
  if (tick) {
    for (const f of tick.activeFlags) {
      const z = zoneForFlag(f);
      out[z] = worst(out[z], f.severity === 'critical' ? 'red' : 'yellow');
    }
  }
  return out;
}
