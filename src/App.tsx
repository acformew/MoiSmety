import { useCallback, useEffect, useRef, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import type { User } from "@supabase/supabase-js";
import { validPublicConfig } from "./lib/publicConfig";
import AuthScreen from "./components/AuthScreen";
import WorkLibrary from "./components/WorkLibrary";
import EstimateList from "./components/EstimateList";
import EstimateEditor from "./components/EstimateEditor";
import Reports from "./reports/Reports";
import { FIELD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./components/UI";
import { db, isConfigured, supabase } from "./lib/supabase";
import { DEFAULT_COLUMNS, SAMPLE_WORKS } from "./lib/types";
import type { DraftWork, EstimateItem } from "./lib/types";
import { localToday, sortRows } from "./lib/format";
import {
  diff,
  empty,
  rebase,
  type Snapshot,
  type State,
} from "./offline/model";
import { authStorage, editState, native, readState } from "./offline/storage";
import { pull, syncAccount } from "./offline/sync";

function Configuration() {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  return (
    <main className="mx-auto max-w-lg p-6 space-y-4">
      <h1 className="text-2xl font-bold">Подключение MoiSmety</h1>
      <p>
        Укажите адрес существующего проекта Supabase и публичный ключ
        publishable или anon.
      </p>
      <input
        className={FIELD}
        aria-label="URL Supabase"
        placeholder="https://project.supabase.co"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <input
        className={FIELD}
        aria-label="Публичный ключ Supabase"
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      <button
        className={PRIMARY_BUTTON}
        onClick={() => {
          if (!validPublicConfig(url.trim(), key.trim())) {
            setError("Проверьте адрес и публичный ключ");
            return;
          }
          localStorage.setItem("moismety-url", url.trim());
          localStorage.setItem("moismety-key", key.trim());
          location.reload();
        }}
      >
        Сохранить подключение
      </button>
      <p role="alert">{error}</p>
    </main>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<State>({ data: empty(), base: empty() });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<
    "library" | "estimates" | "editor" | "reports"
  >("library");
  const [active, setActive] = useState<string>();
  const [date, setDate] = useState(localToday());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const userRef = useRef<string>();
  const syncBusy = useRef(false);
  const writes = useRef(0);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let live = true;
    let observedSession = false;
    void authStorage.getItem("moismety-last-user").then((value) => {
      if (live && value && !observedSession) {
        setUser(JSON.parse(value));
        setLoading(false);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!live) return;
      if (session) {
        observedSession = true;
        setUser(session.user);
        void authStorage.setItem(
          "moismety-last-user",
          JSON.stringify(session.user),
        );
      } else if (event === "SIGNED_OUT" && navigator.onLine) {
        observedSession = true;
        setUser(null);
        void authStorage.removeItem("moismety-last-user");
      }
      setLoading(false);
    });
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (live) {
          if (data.session) setUser(data.session.user);
          setLoading(false);
        }
      })
      .catch(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    userRef.current = user?.id;
    setReady(false);
    setState({ data: empty(), base: empty() });
    setSelected(new Set());
    setActive(undefined);
    setTab("library");
    setError("");
    if (!user) return;
    let live = true;
    void readState(user.id)
      .then((s) => {
        if (live) {
          setState(s);
          setReady(true);
        }
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [user?.id]);
  const publish = useCallback((s: State) => setState(s), []);
  const synchronize = useCallback(async () => {
    const id = userRef.current;
    if (!id || syncBusy.current || !ready) return;
    syncBusy.current = true;
    setSyncing(true);
    setError("");
    try {
      await syncAccount(id, (s) => {
        if (userRef.current === id) publish(s);
      });
    } catch (e) {
      if (userRef.current === id)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      syncBusy.current = false;
      setSyncing(false);
    }
  }, [ready, publish]);
  useEffect(() => {
    if (!ready) return;
    void synchronize();
    const online = () => void synchronize();
    window.addEventListener("online", online);
    const timer = setInterval(() => {
      if (navigator.onLine) void synchronize();
    }, 15000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", online);
    };
  }, [ready, synchronize]);
  const commit = async (edit: (data: Snapshot) => void) => {
    const id = userRef.current;
    if (!id || !ready) throw Error("Данные ещё не загружены");
    writes.current++;
    setSaving(true);
    try {
      const next = await editState(id, (s) => {
        const data = structuredClone(s.data);
        edit(data);
        return { ...s, data };
      });
      if (userRef.current === id) setState(next);
    } finally {
      writes.current--;
      setSaving(writes.current > 0);
    }
  };
  const handleError = (action: Promise<unknown>) =>
    void action.catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  useEffect(() => {
    if (!native) return;
    const listener = NativeApp.addListener("backButton", () => {
      if (
        !window.dispatchEvent(new Event("moismety-back", { cancelable: true }))
      )
        return;
      if (document.querySelector('[role="dialog"]'))
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      else if (tab === "editor") setTab("estimates");
      else if (tab !== "library") setTab("library");
      else void NativeApp.minimizeApp();
    });
    return () => {
      void listener.then((h) => h.remove());
    };
  }, [tab]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (writes.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  const data = state.data;
  const pending = diff(state.base, data).length;
  const current = data.estimates.find((e) => e.id === active);
  const stamp = () => ({
    id: crypto.randomUUID(),
    user_id: user!.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const saveWork = async (draft: DraftWork, id?: string) =>
    commit((d) => {
      const row = d.work_items.find((w) => w.id === id);
      if (row) Object.assign(row, draft);
      else d.work_items.push({ ...stamp(), ...draft });
    });
  const createEstimate = async () => {
    const id = crypto.randomUUID();
    await commit((d) => {
      const works = d.work_items.filter((w) => selected.has(w.id));
      if (!works.length) throw Error("Выберите работы");
      d.estimates.push({
        ...stamp(),
        id,
        title: "Новая смета",
        customer: "",
        estimate_date: localToday(),
        columns_config: { ...DEFAULT_COLUMNS },
        custom_columns: [],
      });
      works.forEach((work, index) =>
        d.estimate_items.push({
          ...stamp(),
          estimate_id: id,
          position: index,
          name: work.name,
          unit: work.unit,
          unit_price: work.price,
          planned_qty: 0,
          completed_qty: 0,
          note: "",
          custom_values: {},
        }),
      );
    });
    setActive(id);
    setTab("editor");
    setSelected(new Set());
  };
  const updateItem = (id: string, patch: Partial<EstimateItem>) =>
    handleError(
      commit((d) => {
        const item = d.estimate_items.find((i) => i.id === id);
        if (!item) return;
        if (
          patch.completed_qty !== undefined &&
          patch.completed_qty !== Number(item.completed_qty)
        ) {
          d.completions.push({
            id: crypto.randomUUID(),
            user_id: user!.id,
            estimate_id: item.estimate_id,
            item_id: id,
            date,
            delta:
              Math.round(
                (patch.completed_qty - Number(item.completed_qty)) * 1000,
              ) / 1000,
            unit_price: Number(item.unit_price),
            created_at: new Date().toISOString(),
          });
        }
        Object.assign(item, patch);
      }),
    );
  const resolve = async (keep: boolean) => {
    if (
      !user ||
      !window.confirm(
        keep
          ? "Сохранить локальные правки поверх текущих серверных значений?"
          : "Заменить все локальные несинхронизированные правки серверными данными?",
      )
    )
      return;
    const remote = await pull(user.id);
    const next = await editState(user.id, (s) =>
      keep ? rebase(s, remote) : { data: remote, base: remote },
    );
    setState(next);
    setError("");
  };
  const logout = async () => {
    if (saving) throw Error("Дождитесь локального сохранения");
    if (
      pending &&
      !window.confirm(
        "Ожидаются изменения. Выйти, сохранив их на этом устройстве? Для отправки понадобится снова войти в этот аккаунт.",
      )
    )
      return;
    await authStorage.removeItem("moismety-last-user");
    await db().auth.signOut({ scope: "local" });
    setUser(null);
  };
  if (!isConfigured) return <Configuration />;
  if (loading) return <p className="p-6">Загрузка аккаунта…</p>;
  if (!user) return <AuthScreen />;
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b p-4 flex flex-wrap items-center gap-3">
        <strong className="text-xl">MoiSmety</strong>
        <span>{user.email}</span>
        <button
          className={SECONDARY_BUTTON}
          onClick={() => handleError(logout())}
        >
          Выйти
        </button>
        <span role="status">
          {saving
            ? "Сохраняем на устройстве…"
            : ready
              ? "Сохранено на устройстве"
              : ""}{" "}
          · Ожидают {pending}
        </span>
        <button
          className={SECONDARY_BUTTON}
          disabled={syncing || !ready}
          onClick={() => void synchronize()}
        >
          {syncing ? "Синхронизация…" : "Синхронизировать"}
        </button>
      </header>
      <nav
        className="flex overflow-x-auto bg-white"
        aria-label="Основные разделы"
      >
        {(["library", "estimates", "reports"] as const).map((t, i) => (
          <button
            key={t}
            className={`tab-button ${tab === t ? "tab-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {["Справочник", "Мои сметы", "Отчёты"][i]}
          </button>
        ))}
      </nav>
      <main className="mx-auto max-w-[1500px] p-4 sm:p-6">
        {error && (
          <div
            role="alert"
            className="rounded-xl bg-rose-50 p-4 mb-4 text-rose-800"
          >
            {error}
            {error.includes("Конфликт") && (
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  className={SECONDARY_BUTTON}
                  onClick={() => handleError(resolve(true))}
                >
                  Сохранить мои правки
                </button>
                <button
                  className={SECONDARY_BUTTON}
                  onClick={() => handleError(resolve(false))}
                >
                  Принять серверные данные
                </button>
                <details>
                  <summary>Сравнить данные</summary>
                  <pre className="overflow-auto max-h-72 text-xs">
                    {JSON.stringify(state.inflight?.changes, null, 2)}
                  </pre>
                  <button
                    onClick={() =>
                      handleError(
                        pull(user.id).then((remote) =>
                          setError(
                            "Конфликт. Серверные данные " +
                              JSON.stringify(remote),
                          ),
                        ),
                      )
                    }
                  >
                    Показать серверные данные
                  </button>
                </details>
              </div>
            )}
          </div>
        )}
        {!ready ? (
          <p>Открываем локальную базу…</p>
        ) : (
          <>
            {tab === "library" && (
              <WorkLibrary
                works={data.work_items}
                selected={selected}
                busy={false}
                onToggle={(id) =>
                  setSelected((s) => {
                    const n = new Set(s);
                    if (n.has(id)) n.delete(id);
                    else n.add(id);
                    return n;
                  })
                }
                onToggleAll={(ids, on) =>
                  setSelected((s) => {
                    const n = new Set(s);
                    ids.forEach((id) => {
                      if (on) n.add(id);
                      else n.delete(id);
                    });
                    return n;
                  })
                }
                onSaveWork={saveWork}
                onDeleteWork={(id) =>
                  commit((d) => {
                    d.work_items = d.work_items.filter((w) => w.id !== id);
                  })
                }
                onSamples={() =>
                  commit((d) => {
                    if (d.work_items.length)
                      throw Error("Справочник уже содержит работы");
                    d.work_items = SAMPLE_WORKS.map((w) => ({
                      ...stamp(),
                      ...w,
                    }));
                  })
                }
                onCreateEstimate={createEstimate}
              />
            )}
            {tab === "estimates" && (
              <EstimateList
                estimates={data.estimates}
                items={data.estimate_items}
                onOpen={(id) => {
                  setActive(id);
                  setTab("editor");
                }}
                onDelete={(id) =>
                  commit((d) => {
                    d.estimates = d.estimates.filter((e) => e.id !== id);
                    d.estimate_items = d.estimate_items.filter(
                      (i) => i.estimate_id !== id,
                    );
                  })
                }
                onGoToLibrary={() => setTab("library")}
              />
            )}
            {tab === "editor" && current && (
              <>
                <label className="block mb-4 max-w-sm">
                  Дата записи выполнения
                  <input
                    className={FIELD}
                    type="date"
                    required
                    value={date}
                    onChange={(e) => {
                      if (e.target.value) setDate(e.target.value);
                    }}
                  />
                </label>
                <EstimateEditor
                  estimate={current}
                  items={sortRows(
                    data.estimate_items.filter((i) => i.estimate_id === active),
                  )}
                  works={data.work_items}
                  busy={false}
                  onBack={() => setTab("estimates")}
                  onUpdateEstimate={(patch) =>
                    handleError(
                      commit((d) => {
                        Object.assign(
                          d.estimates.find((e) => e.id === active)!,
                          patch,
                        );
                      }),
                    )
                  }
                  onUpdateItem={updateItem}
                  onAddWorks={(works) =>
                    commit((d) => {
                      const position =
                        Math.max(
                          -1,
                          ...d.estimate_items
                            .filter((i) => i.estimate_id === active)
                            .map((i) => i.position),
                        ) + 1;
                      works.forEach((w, index) =>
                        d.estimate_items.push({
                          ...stamp(),
                          estimate_id: active!,
                          position: position + index,
                          name: w.name,
                          unit: w.unit,
                          unit_price: w.price,
                          planned_qty: 0,
                          completed_qty: 0,
                          note: "",
                          custom_values: {},
                        }),
                      );
                    })
                  }
                  onAddManual={() =>
                    commit((d) => {
                      d.estimate_items.push({
                        ...stamp(),
                        estimate_id: active!,
                        position:
                          Math.max(
                            -1,
                            ...d.estimate_items
                              .filter((i) => i.estimate_id === active)
                              .map((i) => i.position),
                          ) + 1,
                        name: "Новая работа",
                        unit: "шт.",
                        unit_price: 0,
                        planned_qty: 0,
                        completed_qty: 0,
                        note: "",
                        custom_values: {},
                      });
                    })
                  }
                  onRemoveItem={(id) =>
                    commit((d) => {
                      d.estimate_items = d.estimate_items.filter(
                        (i) => i.id !== id,
                      );
                    })
                  }
                />
              </>
            )}
            {tab === "reports" && (
              <Reports data={data} user={user.id} commit={commit} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
