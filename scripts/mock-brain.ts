/**
 * Tiny standalone mock of the backend "brain".
 * Replays real astro-brain v0.6 ticks (src/data/brainSamples, captured by actually running the brain)
 * green → yellow → red at 1 tick/s — full contract: bodySystems, flagDetails, likelyConditions, plans,
 * news2Score, doctorSource.
 *
 *   npm run mock-brain            # ws://localhost:8787
 *   NEXT_PUBLIC_BRAIN_WS_URL=ws://localhost:8787 npm run dev
 */
import { WebSocketServer } from 'ws';
import { scenarioTick } from '../src/lib/brainMock';

const port = Number(process.env.PORT ?? 8787);
const wss = new WebSocketServer({ port });
let i = 0;

setInterval(() => {
  const tick = scenarioTick(i++);
  const msg = JSON.stringify(tick);
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
  process.stdout.write(`\rtick ${tick.seq} ${tick.alertLevel.padEnd(6)} news2 ${String(tick.news2Score ?? '—').padEnd(2)} doctor:${(tick.doctorSource ?? '—').padEnd(8)} SpO2 ${tick.rawVitals.spo2}%  HR ${tick.rawVitals.hr}  clients ${wss.clients.size}   `);
}, 1000);

console.log(`AstroCare mock brain on ws://localhost:${port}`);
