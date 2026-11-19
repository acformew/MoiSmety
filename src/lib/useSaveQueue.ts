import { useCallback, useRef, useState } from 'react';

type Status = 'saved' | 'saving' | 'error';
type Patch = Record<string, unknown>;
type Entry = {
  patch: Patch;
  send: (patch: Patch) => Promise<void>;
  timer: ReturnType<typeof setTimeout> | null;
  promise: Promise<void> | null;
  failed: boolean;
};

/** Последовательная очередь записи по ID. Дребезг ввода не даёт старому запросу
 * перезаписать новый. При сбое изменения остаются в очереди до повтора. */
export function useSaveQueue() {
  const jobs = useRef(new Map<string, Entry>());
  const immediate = useRef(0);
  const immediateFailed = useRef(false);
  const [status, setStatus] = useState<Status>('saved');

  const refresh = useCallback(() => {
    const entries = [...jobs.current.values()];
    if (immediateFailed.current || entries.some((entry) => entry.failed)) {
      setStatus('error');
    } else if (immediate.current > 0 || entries.length > 0) {
      setStatus('saving');
    } else {
      setStatus('saved');
    }
  }, []);

  const drain = useCallback((key: string): Promise<void> => {
    const entry = jobs.current.get(key);
    if (!entry) return Promise.resolve();
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
    if (entry.promise) return entry.promise;
    entry.failed = false;
    entry.promise = (async () => {
      while (Object.keys(entry.patch).length > 0) {
        const batch = entry.patch;
        entry.patch = {};
        try {
          await entry.send(batch);
        } catch (error) {
          // Более новые значения в очереди имеют приоритет.
          entry.patch = { ...batch, ...entry.patch };
          entry.failed = true;
          throw error;
        }
      }
      jobs.current.delete(key);
    })().finally(() => {
      entry.promise = null;
      refresh();
    });
    refresh();
    return entry.promise;
  }, [refresh]);

  const queuePatch = useCallback((key: string, patch: Patch, send: (patch: Patch) => Promise<void>) => {
    const existing = jobs.current.get(key);
    const entry: Entry = existing ?? { patch: {}, send, timer: null, promise: null, failed: false };
    entry.patch = { ...entry.patch, ...patch };
    entry.send = send;
    entry.failed = false;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => { void drain(key).catch(() => {}); }, 550);
    jobs.current.set(key, entry);
    refresh();
  }, [drain, refresh]);

  const flushAll = useCallback(async () => {
    const pending = [...jobs.current.keys()];
    const results = await Promise.allSettled(pending.map((key) => drain(key)));
    if (results.some((result) => result.status === 'rejected') || immediateFailed.current) {
      throw new Error('Не все изменения сохранились. Проверьте соединение и нажмите «Повторить».');
    }
  }, [drain]);

  const flushKey = useCallback(async (key: string) => {
    await drain(key);
  }, [drain]);

  const retry = useCallback(() => {
    immediateFailed.current = false;
    const keys = [...jobs.current.keys()];
    keys.forEach((key) => {
      const entry = jobs.current.get(key);
      if (entry) entry.failed = false;
      void drain(key).catch(() => {});
    });
    refresh();
  }, [drain, refresh]);

  const runNow = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    immediate.current += 1;
    immediateFailed.current = false;
    refresh();
    try {
      return await action();
    } catch (error) {
      immediateFailed.current = true;
      throw error;
    } finally {
      immediate.current -= 1;
      refresh();
    }
  }, [refresh]);

  const clear = useCallback(() => {
    jobs.current.forEach((job) => { if (job.timer) clearTimeout(job.timer); });
    jobs.current.clear();
    immediateFailed.current = false;
    refresh();
  }, [refresh]);

  return { status, queuePatch, flushAll, flushKey, retry, runNow, clear };
}
