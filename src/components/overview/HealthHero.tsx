'use client';
import { Bell, RefreshCw, ArrowRight, WifiOff } from 'lucide-react';
import { useHealthStore } from '@/store/useHealthStore';
import { STATUS_META } from '@/lib/status';
import { fmtAgo } from '@/lib/trend';
import { STATUS_RANK } from '@/lib/triageEngine';
import { zoneForFlag } from '@/lib/flagZone';
import type { useDashboard } from '@/hooks/useDashboard';
import type { TriageStatus, ZoneId } from '@/types/health';

function Ring({ value, status }: { value: number; status: TriageStatus }) {
  const r = 30, c = 2 * Math.PI * r, color = STATUS_META[status].color;
  return (
    <svg width={76} height={76} viewBox="0 0 76 76" aria-hidden>
      <circle cx={38} cy={38} r={r} stroke="rgba(148,163,184,0.15)" strokeWidth={7} fill="none" />
      <circle cx={38} cy={38} r={r} stroke={color} strokeWidth={7} fill="none" strokeLinecap="round"
        strokeDasharray={`${(c * Math.min(100, value)) / 100} ${c}`} transform="rotate(-90 38 38)" style={{ transition: 'stroke-dasharray .8s ease' }} />
      <text x={38} y={44} textAnchor="middle" fontSize={20} fontWeight={700} fill="#F5F7FA" className="num">{value}</text>
    </svg>
  );
}

/**
 * The 3-second answer: overall status, the single most important issue with its recommended action,
 * recovery score, number of active alerts and data freshness.
 */
export function HealthHero({ d }: { d: ReturnType<typeof useDashboard> }) {
  const level = useHealthStore((s) => s.level);
  const since = useHealthStore((s) => s.levelSince);
  const redAt = useHealthStore((s) => s.redBannerAt);
  const selectZone = useHealthStore((s) => s.selectZone);
  const lost = d.fresh.state === 'lost';
  const status: TriageStatus = lost ? 'stale' : level ?? d.result.overall;
  const m = STATUS_META[status];
  const Icon = m.icon;
  const alarm = status === 'yellow' || status === 'red';
  const flags = [...(d.tick?.activeFlags ?? [])].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
  const critical = flags.filter((f) => f.severity === 'critical').length;

  // most important issue: top brain flag, else worst triage metric
  let issue: string | null = flags[0]?.reason ?? null;
  let zone: ZoneId | null = flags[0] ? zoneForFlag(flags[0]) : null;
  if (!issue) {
    const worst = Object.values(d.result.zones).flatMap((z) => z.metrics.map((mm) => ({ mm, z: z.zoneId })))
      .filter(({ mm }) => mm.status === 'yellow' || mm.status === 'red').sort((a, b) => STATUS_RANK[b.mm.status] - STATUS_RANK[a.mm.status])[0];
    if (worst) { issue = worst.mm.reason; zone = worst.z; }
  }
  const action = d.tick?.doctorRecommendation?.split(/(?<=[.!?])\s+/)[0];
  const recovery = d.scores.find((s) => s.id === 'recovery')!;
  const pulse = status === 'red' && redAt && d.now - redAt < 3000;

  return (
    <section aria-live="polite" aria-label="Overall health status"
      className={`card grid gap-4 rounded-card p-4 md:p-5 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center ${pulse ? 'pulse-once' : ''}`}
      style={alarm ? { background: `linear-gradient(0deg, ${m.bg}, ${m.bg}), #141E2D`, borderColor: `${m.color}55` } : undefined}>
      {/* overall status */}
      <div className="flex items-center gap-4 lg:pr-6">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl" style={{ background: m.bg, color: m.color }}>
          <Icon size={30} aria-hidden />
        </div>
        <div>
          <div className="text-xs font-medium text-muted">Overall health status</div>
          <div className="text-[34px] font-bold leading-none tracking-tight" style={{ color: m.color }}>{m.word}</div>
          <div className="mt-1 text-xs text-muted">for {fmtAgo((d.now - since) / 1000)} · {d.astronaut.name}</div>
        </div>
      </div>

      {/* main issue + action */}
      <div className="min-w-0 border-white/[0.06] lg:border-l lg:pl-6">
        <div className="text-xs font-medium text-muted">{issue ? 'Most important issue' : 'Assessment'}</div>
        <p className="mt-0.5 text-lg font-semibold leading-snug text-ink">{issue ?? 'All parameters within the normal range. No action needed.'}</p>
        {issue && action && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm text-slate-300"><span className="text-muted">Recommended: </span>{action}</p>
            {zone && <button onClick={() => selectZone(zone)} className="flex items-center gap-1 text-sm font-medium text-info hover:underline">Open protocol <ArrowRight size={14} /></button>}
          </div>
        )}
      </div>

      {/* key numbers */}
      <div className="grid grid-cols-3 gap-2 lg:flex lg:gap-6 lg:border-l lg:border-white/[0.06] lg:pl-6">
        <div className="flex items-center gap-2" title={recovery.formula}>
          <Ring value={recovery.value} status={recovery.status} />
          <div className="hidden text-xs leading-tight text-muted xl:block">Recovery<br />score</div>
        </div>
        <a href="#alerts" className="flex flex-col justify-center rounded-xl px-2 hover:bg-raised/60">
          <span className="flex items-center gap-1.5 text-xs text-muted"><Bell size={13} />Active alerts</span>
          <span className="num text-3xl font-bold text-ink">{flags.length}</span>
          <span className="text-xs" style={{ color: critical ? '#EF4444' : flags.length ? '#F59E0B' : '#22C55E' }}>{critical ? `${critical} critical` : flags.length ? 'warnings' : 'none'}</span>
        </a>
        <div className="flex flex-col justify-center px-2">
          <span className="flex items-center gap-1.5 text-xs text-muted">{lost ? <WifiOff size={13} /> : <RefreshCw size={13} />}Last sync</span>
          <span className="num text-xl font-semibold" style={{ color: lost ? '#64748B' : d.fresh.state === 'delayed' ? '#F59E0B' : '#F5F7FA' }}>
            {Number.isFinite(d.fresh.ageSec) ? `${fmtAgo(Math.max(0, d.fresh.ageSec))} ago` : '—'}
          </span>
          <span className="text-xs text-muted">
            {lost ? 'signal lost' : d.fresh.state === 'delayed' ? 'delayed' : 'live'}
            {d.tick?.doctorSource && <span className="ml-1 text-slate-500" title="Where the doctor recommendation came from">· {d.tick.doctorSource}</span>}
          </span>
        </div>
      </div>
    </section>
  );
}
