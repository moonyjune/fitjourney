import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchClientRows, requestDigest, type AiErrorKind } from '../sync/cloudSync';
import { useAiDigestStore, type DigestEntry } from '../store/useAiDigestStore';
import type { CoachClientSummary } from '../types';
import { toDateKey } from '../utils/date';
import { addDays } from '../utils/milestones';
import { weekStartKey } from '../utils/weekKey';
import { chunk, cleanDigest, clientStatusOf, weekSourceFromRows } from './coachDigest';
import { buildWeekInput, type WeekInput } from './weeklyReport';

export interface DigestRun {
  /** Clients that were summarised (or found to have nothing logged). */
  done: number;
  /** Clients whose data could not be read, so they were left out. */
  unreadable: number;
}

/** Builds this week's digest for the coach's clients: reads each client's rows, works out their week and status here, sends the
 *  ones with data to the AI in batches of 12 (the ones with nothing logged need no AI), and keeps the result on the device.
 *  A failed batch stops the run; what is known (every status, the summaries so far) is still saved. */
export function useCoachDigest(clients: CoachClientSummary[]) {
  const save = useAiDigestStore((s) => s.save);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AiErrorKind | null>(null);
  const [last, setLast] = useState<DigestRun | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(
    async (now: Date = new Date()): Promise<void> => {
      if (busy || clients.length === 0) return;
      setBusy(true);
      setFailure(null);
      const period = weekStartKey(now);
      const since = toDateKey(addDays(new Date(`${period}T12:00:00`), -14));
      const generatedAtISO = now.toISOString();

      const weeks = await Promise.all(
        clients.map(async (c) => {
          const rows = await fetchClientRows(c.id, since);
          return rows ? { client: c, week: buildWeekInput(weekSourceFromRows(rows), now) } : { client: c, week: null as WeekInput | null };
        })
      );
      const entries: Record<string, DigestEntry> = {};
      const withData: { client: CoachClientSummary; week: WeekInput }[] = [];
      let unreadable = 0;
      for (const { client, week } of weeks) {
        if (!week) {
          unreadable += 1;
          continue;
        }
        const status = clientStatusOf(week);
        entries[client.id] = { status, generatedAtISO };
        if (status !== 'no_data') withData.push({ client, week });
      }

      let failed: AiErrorKind | null = null;
      for (const group of chunk(withData)) {
        const items = group.map((g, i) => ({ key: `c${i + 1}`, week: g.week }));
        const outcome = await requestDigest(items, period);
        if (!outcome.ok) {
          failed = outcome.kind;
          break;
        }
        const texts = cleanDigest(outcome.result, items.map((i) => i.key));
        group.forEach((g, i) => {
          const t = texts[`c${i + 1}`];
          if (t) entries[g.client.id] = { ...entries[g.client.id], summary: t.summary, ...(t.nudge ? { nudge: t.nudge } : {}) };
        });
      }

      save(period, entries);
      if (!alive.current) return;
      setFailure(failed);
      setLast({ done: Object.keys(entries).length, unreadable });
      setBusy(false);
    },
    [busy, clients, save]
  );

  return { run, busy, failure, last };
}
