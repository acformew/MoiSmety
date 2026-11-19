import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AlertCircle, BookOpen, FileSpreadsheet, HardHat, LogOut, RefreshCcw, ShieldCheck } from 'lucide-react';
import AuthScreen from './components/AuthScreen';
import WorkLibrary from './components/WorkLibrary';
import EstimateList from './components/EstimateList';
import EstimateEditor from './components/EstimateEditor';
import { BusyIcon, SavedIndicator, SECONDARY_BUTTON } from './components/UI';
import type { DraftWork, Estimate, EstimateItem, WorkItem } from './lib/types';
import { DEFAULT_COLUMNS, SAMPLE_WORKS } from './lib/types';
import { getErrorMessage, localToday, sortRows } from './lib/format';
import { assertSuccess, db, isConfigured, supabase } from './lib/supabase';
import { useSaveQueue } from './lib/useSaveQueue';

type Tab = 'library' | 'estimates' | 'editor';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [notice, setNotice] = useState('');
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [estimateItems, setEstimateItems] = useState<EstimateItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>('library');
  const [activeEstimateId, setActiveEstimateId] = useState<string | null>(null);
  const saving = useSaveQueue();
  const requestGeneration = useRef(0);
  const user = session?.user;

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    let live = true;
    const client = supabase;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (live) { setSession(nextSession); setAuthLoading(false); }
    });
    void client.auth.getSession().then(({ data, error }) => {
      if (!live) return;
      if (error) setDataError(getErrorMessage(error));
      setSession(data.session);
      setAuthLoading(false);
    }).catch((error: unknown) => {
      if (live) { setDataError(getErrorMessage(error)); setAuthLoading(false); }
    });
    return () => { live = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saving.status !== 'saved') {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [saving.status]);

  const loadAll = useCallback(async (userId: string) => {
    const generation = ++requestGeneration.current;
    setDataLoading(true);
    setDataError('');
    try {
      const [workResult, estimateResult, itemResult] = await Promise.all([
        db().from('work_items').select('*').eq('user_id', userId).order('name'),
        db().from('estimates').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        db().from('estimate_items').select('*').eq('user_id', userId).order('position'),
      ]);
      assertSuccess(workResult.error);
      assertSuccess(estimateResult.error);
      assertSuccess(itemResult.error);
      if (generation !== requestGeneration.current) return;
      setWorks((workResult.data ?? []) as WorkItem[]);
      setEstimates((estimateResult.data ?? []) as Estimate[]);
      setEstimateItems((itemResult.data ?? []) as EstimateItem[]);
      setSelected(new Set());
    } catch (error) {
      if (generation === requestGeneration.current) setDataError(getErrorMessage(error));
    } finally {
      if (generation === requestGeneration.current) setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.id) {
      void loadAll(user.id);
    } else {
      requestGeneration.current += 1;
      setDataLoading(false);
      setWorks([]);
      setEstimates([]);
      setEstimateItems([]);
      setActiveEstimateId(null);
      setSelected(new Set());
      setTab('library');
      saving.clear();
    }
    // Смена пользователя — единственная причина автоматически перезагружать данные.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loadAll]);

  const toggleSelected = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = (ids: string[], shouldSelect: boolean) => setSelected((current) => {
    const next = new Set(current);
    ids.forEach((id) => { if (shouldSelect) next.add(id); else next.delete(id); });
    return next;
  });

  const saveWork = async (draft: DraftWork, id?: string) => {
    if (!user) throw new Error('Войдите в аккаунт.');
    await saving.runNow(async () => {
      if (id) {
        const { data, error } = await db().from('work_items').update(draft).eq('id', id).eq('user_id', user.id).select().single();
        assertSuccess(error);
        setWorks((current) => current.map((work) => work.id === id ? data as WorkItem : work).sort((a, b) => a.name.localeCompare(b.name, 'ru')));
      } else {
        const { data, error } = await db().from('work_items').insert({ ...draft, user_id: user.id }).select().single();
        assertSuccess(error);
        setWorks((current) => [...current, data as WorkItem].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
      }
    });
  };

  const deleteWork = async (id: string) => {
    if (!user) return;
    await saving.runNow(async () => {
      const { error } = await db().from('work_items').delete().eq('id', id).eq('user_id', user.id);
      assertSuccess(error);
      setWorks((current) => current.filter((work) => work.id !== id));
      setSelected((current) => { const next = new Set(current); next.delete(id); return next; });
    });
  };

  const loadSamples = async () => {
    if (!user) return;
    if (works.length !== 0) throw new Error('Примеры можно загрузить только в пустой справочник.');
    await saving.runNow(async () => {
      const { data, error } = await db().from('work_items').insert(SAMPLE_WORKS.map((work) => ({ ...work, user_id: user.id }))).select();
      assertSuccess(error);
      setWorks((data ?? []) as WorkItem[]);
      setNotice('10 примеров добавлены. Выберите работы галочками и составьте первую смету.');
    });
  };

  const createEstimate = async () => {
    if (!user) return;
    const selectedWorks = works.filter((work) => selected.has(work.id));
    if (selectedWorks.length === 0) throw new Error('Сначала выберите хотя бы одну работу.');
    await saving.runNow(async () => {
      const { data: estimate, error } = await db().from('estimates').insert({
        user_id: user.id,
        title: 'Новая смета',
        customer: '',
        estimate_date: localToday(),
        columns_config: { ...DEFAULT_COLUMNS },
        custom_columns: [],
      }).select().single();
      assertSuccess(error);
      const newEstimate = estimate as Estimate;
      const payload = selectedWorks.map((work, index) => ({
        estimate_id: newEstimate.id,
        user_id: user.id,
        position: index,
        name: work.name,
        unit: work.unit,
        unit_price: work.price,
        planned_qty: 0,
        completed_qty: 0,
        note: '',
        custom_values: {},
      }));
      const { data: rows, error: itemError } = await db().from('estimate_items').insert(payload).select();
      if (itemError) {
        await db().from('estimates').delete().eq('id', newEstimate.id).eq('user_id', user.id);
        throw itemError;
      }
      setEstimates((current) => [newEstimate, ...current]);
      setEstimateItems((current) => [...current, ...((rows ?? []) as EstimateItem[])]);
      setActiveEstimateId(newEstimate.id);
      setTab('editor');
      setSelected(new Set());
    });
  };

  const updateEstimate = (patch: Partial<Estimate>) => {
    if (!user || !activeEstimateId) return;
    const id = activeEstimateId;
    setEstimates((current) => current.map((estimate) => estimate.id === id ? { ...estimate, ...patch } : estimate));
    saving.queuePatch(`estimate:${id}`, patch, async (payload) => {
      const { error } = await db().from('estimates').update(payload).eq('id', id).eq('user_id', user.id);
      assertSuccess(error);
    });
  };

  const updateItem = (id: string, patch: Partial<EstimateItem>) => {
    if (!user) return;
    setEstimateItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    const payload: Partial<EstimateItem> = { ...patch };
    // В БД нельзя записать пустое имя / единицу. Разрешаем допечатать в поле ввода.
    if (typeof payload.name === 'string' && !payload.name.trim()) delete payload.name;
    if (typeof payload.unit === 'string' && !payload.unit.trim()) delete payload.unit;
    if (Object.keys(payload).length === 0) return;
    saving.queuePatch(`item:${id}`, payload, async (values) => {
      const { error } = await db().from('estimate_items').update(values).eq('id', id).eq('user_id', user.id);
      assertSuccess(error);
    });
  };

  const addRows = async (newWorks: Array<Pick<WorkItem, 'name' | 'unit' | 'price'>>) => {
    if (!user || !activeEstimateId || newWorks.length === 0) return;
    const estimateId = activeEstimateId;
    await saving.runNow(async () => {
      const positions = estimateItems.filter((row) => row.estimate_id === estimateId).map((row) => row.position);
      const nextPosition = positions.length ? Math.max(...positions) + 1 : 0;
      const payload = newWorks.map((work, index) => ({
        estimate_id: estimateId,
        user_id: user.id,
        position: nextPosition + index,
        name: work.name,
        unit: work.unit,
        unit_price: work.price,
        planned_qty: 0,
        completed_qty: 0,
        note: '',
        custom_values: {},
      }));
      const { data, error } = await db().from('estimate_items').insert(payload).select();
      assertSuccess(error);
      setEstimateItems((current) => [...current, ...((data ?? []) as EstimateItem[])]);
    });
  };

  const addManual = async () => { await addRows([{ name: 'Новая работа', unit: 'шт.', price: 0 }]); };

  const removeItem = async (id: string) => {
    if (!user) return;
    await saving.flushKey(`item:${id}`);
    await saving.runNow(async () => {
      const { error } = await db().from('estimate_items').delete().eq('id', id).eq('user_id', user.id);
      assertSuccess(error);
      setEstimateItems((current) => current.filter((item) => item.id !== id));
    });
  };

  const deleteEstimate = async (id: string) => {
    if (!user) return;
    await saving.flushAll();
    await saving.runNow(async () => {
      const { error } = await db().from('estimates').delete().eq('id', id).eq('user_id', user.id);
      assertSuccess(error);
      setEstimates((current) => current.filter((estimate) => estimate.id !== id));
      setEstimateItems((current) => current.filter((item) => item.estimate_id !== id));
      if (activeEstimateId === id) { setActiveEstimateId(null); setTab('estimates'); }
    });
  };

  const logout = async () => {
    setNotice('');
    try {
      await saving.flushAll();
      const { error } = await db().auth.signOut();
      assertSuccess(error);
      saving.clear();
    } catch (e) { setNotice(getErrorMessage(e)); }
  };

  const changeTab = (nextTab: Tab) => {
    setTab(nextTab);
    if (nextTab !== 'editor') setActiveEstimateId(null);
  };
  const currentEstimate = estimates.find((estimate) => estimate.id === activeEstimateId);
  const currentItems = useMemo(() => sortRows(estimateItems.filter((item) => item.estimate_id === activeEstimateId)), [estimateItems, activeEstimateId]);

  if (!isConfigured) return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5"><div className="max-w-xl rounded-2xl border border-amber-200 bg-white p-8 shadow-card"><AlertCircle size={35} className="mb-4 text-amber-600" /><h1 className="text-2xl font-extrabold text-ink">Нужно подключить Supabase</h1><p className="mt-3 text-sm leading-7 text-slate-600">Создайте файл <code className="rounded bg-slate-100 px-1">.env</code> по образцу <code className="rounded bg-slate-100 px-1">.env.example</code>, заполните <strong>VITE_SUPABASE_URL</strong> и <strong>VITE_SUPABASE_ANON_KEY</strong>, затем перезапустите приложение. Для GitHub Pages эти значения добавляются в GitHub → Settings → Secrets and variables → Actions.</p></div></main>
  );
  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-brand-700"><BusyIcon className="!h-8 !w-8" /><span className="ml-3 font-medium">Загрузка аккаунта...</span></div>;
  if (!user) return <AuthScreen />;

  return (
    <div className="min-h-screen bg-[#f5f8f8]">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8"><div className="flex items-center gap-2.5"><div className="rounded-xl bg-brand-600 p-2 text-white"><HardHat size={25} /></div><div><div className="text-lg font-black leading-tight tracking-tight text-ink">СМЕТА</div><div className="text-[10px] font-semibold text-slate-400">Работы под контролем</div></div></div><div className="flex flex-wrap items-center gap-2 sm:gap-4"><SavedIndicator status={saving.status} onRetry={saving.retry} /><span className="max-w-[125px] truncate text-[11px] font-medium text-slate-600 sm:max-w-[240px] sm:text-xs" title={user.email}>{user.email}</span><button type="button" onClick={() => void logout()} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-rose-700" aria-label={`Выйти из аккаунта ${user.email}`}><LogOut size={18} /><span>Выйти</span></button></div></div></header>
      <div className="no-print border-b border-slate-200 bg-white"><nav aria-label="Основные разделы" className="mx-auto flex max-w-[1500px] gap-1 px-4 sm:px-6 lg:px-8"><button type="button" className={`tab-button ${tab === 'library' ? 'tab-active' : ''}`} onClick={() => changeTab('library')}><BookOpen size={18} />Справочник</button><button type="button" className={`tab-button ${tab === 'estimates' || tab === 'editor' ? 'tab-active' : ''}`} onClick={() => changeTab('estimates')}><FileSpreadsheet size={18} />Мои сметы <span className="rounded-md bg-slate-100 px-1.5 text-xs text-slate-600">{estimates.length}</span></button></nav></div>
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {dataLoading ? <div className="flex justify-center rounded-2xl bg-white p-12 text-brand-700"><BusyIcon /><span className="ml-3">Загружаем ваши данные...</span></div> : (
          <>
            {dataError && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><div className="flex items-center gap-2"><AlertCircle size={18} />{dataError}</div><button className={SECONDARY_BUTTON} onClick={() => void loadAll(user.id)}><RefreshCcw size={17} />Повторить загрузку</button></div>}
            {notice && <div role="status" className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button aria-label="Закрыть уведомление" onClick={() => setNotice('')} className="font-bold">×</button></div>}
            {tab === 'library' && <WorkLibrary works={works} selected={selected} busy={saving.status === 'saving'} onToggle={toggleSelected} onToggleAll={toggleAll} onSaveWork={saveWork} onDeleteWork={deleteWork} onSamples={loadSamples} onCreateEstimate={createEstimate} />}
            {tab === 'estimates' && <EstimateList estimates={estimates} items={estimateItems} onOpen={(id) => { setActiveEstimateId(id); setTab('editor'); }} onDelete={deleteEstimate} onGoToLibrary={() => changeTab('library')} />}
            {tab === 'editor' && currentEstimate && <EstimateEditor estimate={currentEstimate} items={currentItems} works={works} busy={saving.status === 'saving'} onBack={() => changeTab('estimates')} onUpdateEstimate={updateEstimate} onUpdateItem={updateItem} onAddWorks={addRows} onAddManual={addManual} onRemoveItem={removeItem} />}
          </>
        )}
        <footer className="no-print mt-10 flex flex-wrap items-center justify-center gap-2 pb-6 text-center text-xs text-slate-400"><ShieldCheck size={15} />Ваши данные доступны только вашему аккаунту · Смета v1.0</footer>
      </main>
    </div>
  );
}
