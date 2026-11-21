import { db } from "../lib/supabase";
import { acknowledge, diff, rebase, type Snapshot, type State } from "./model";
import { editState } from "./storage";
function validateSnapshot(value: unknown, user: string): Snapshot {
  const snapshot = value as Snapshot & { account_id?: string };
  if (
    !snapshot ||
    snapshot.account_id !== user ||
    Object.values(snapshot).some(
      (rows) => Array.isArray(rows) && rows.some((row) => row.user_id !== user),
    )
  )
    throw Error("Ответ сервера относится к другому аккаунту");
  return snapshot;
}
export async function pull(user: string): Promise<Snapshot> {
  const { data, error } = await db().rpc("moismety_snapshot");
  if (error) throw Error(error.message);
  return validateSnapshot(data, user);
}
export async function syncAccount(
  user: string,
  publish: (s: State) => void,
): Promise<void> {
  const run = async () => {
    const state = await editState(user, (s) => {
      if (s.inflight) return s;
      const changes = diff(s.base, s.data);
      return changes.length
        ? {
            ...s,
            inflight: {
              id: crypto.randomUUID(),
              changes,
              sent: structuredClone(s.data),
            },
          }
        : s;
    });
    if (state.inflight) {
      const { data, error } = await db().rpc("moismety_sync", {
        operation_id: state.inflight.id,
        changes: state.inflight.changes,
      });
      if (error) {
        // A database validation error confirms rollback. Rebuild the next batch
        // from durable edits so corrected input can be submitted.
        if (/^(22|23|42|P0|PGRST)/.test(error.code ?? "")) {
          publish(
            await editState(user, (s) => ({ data: s.data, base: s.base })),
          );
        }
        throw Error(
          error.code === "40001"
            ? "Конфликт изменений. Выберите способ разрешения."
            : error.message,
        );
      }
      publish(
        await editState(user, (s) =>
          acknowledge(s, validateSnapshot(data, user)),
        ),
      );
    } else {
      const remote = await pull(user);
      publish(
        await editState(user, (s) =>
          diff(s.base, s.data).length ? s : rebase(s, remote),
        ),
      );
    }
  };
  if (navigator.locks)
    await navigator.locks.request("moismety-sync-" + user, run);
  else await run();
}
