import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { BookOpen, CheckSquare, ChevronRight, ClipboardList, Edit3, FilePlus2, Plus, Search, Trash2 } from 'lucide-react';
import type { DraftWork, WorkItem } from '../lib/types';
import { UNITS } from '../lib/types';
import { canTypeNumber, money, safeNumber } from '../lib/format';
import { BusyIcon, ConfirmDialog, FIELD, Modal, PRIMARY_BUTTON, SECONDARY_BUTTON, UnitEditor } from './UI';

function WorkForm({ work, onClose, onSave }: { work: WorkItem | null; onClose: () => void; onSave: (work: DraftWork, id?: string) => Promise<void> }) {
  const [name, setName] = useState(work?.name ?? '');
  const [unit, setUnit] = useState(work?.unit ?? UNITS[0]);
  const [price, setPrice] = useState(String(work?.price ?? ''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!name.trim()) return setError('Введите название работы.');
    if (!unit.trim()) return setError('Введите единицу измерения.');
    setLoading(true);
    try {
      await onSave({ name: name.trim(), unit: unit.trim(), price: safeNumber(price, 2) }, work?.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить работу.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal title={work ? 'Редактировать работу' : 'Добавить работу'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Наименование работы</span><input autoFocus required maxLength={250} className={FIELD} placeholder="Например, укладка плитки" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Ед. изм.</span><UnitEditor value={unit} onChange={setUnit} /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Цена, ₽</span><input inputMode="decimal" className={`${FIELD} tabular-nums`} placeholder="0,00" value={price} onChange={(event) => { if (canTypeNumber(event.target.value, 2)) setPrice(event.target.value); }} /></label>
        </div>
        <p className="text-xs leading-5 text-slate-500">Дробные числа можно вводить через запятую или точку. Цена не может быть отрицательной.</p>
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" className={SECONDARY_BUTTON} onClick={onClose} disabled={loading}>Отмена</button><button type="submit" className={PRIMARY_BUTTON} disabled={loading}>{loading && <BusyIcon />}{work ? 'Сохранить' : 'Добавить'}</button></div>
      </form>
    </Modal>
  );
}

export default function WorkLibrary({ works, selected, busy, onToggle, onToggleAll, onSaveWork, onDeleteWork, onSamples, onCreateEstimate }: {
  works: WorkItem[];
  selected: Set<string>;
  busy: boolean;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], shouldSelect: boolean) => void;
  onSaveWork: (work: DraftWork, id?: string) => Promise<void>;
  onDeleteWork: (id: string) => Promise<void>;
  onSamples: () => Promise<void>;
  onCreateEstimate: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<WorkItem | null | 'new'>(null);
  const [deleting, setDeleting] = useState<WorkItem | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [error, setError] = useState('');
  const filtered = useMemo(() => works.filter((work) => work.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))), [works, search]);
  const allVisibleSelected = filtered.length > 0 && filtered.every((work) => selected.has(work.id));
  const run = async (operation: () => Promise<void>) => {
    setLocalBusy(true);
    setError('');
    try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка операции.'); } finally { setLocalBusy(false); }
  };
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="mb-1 flex items-center gap-2 text-brand-700"><BookOpen size={19} /><span className="text-xs font-extrabold uppercase tracking-widest">Ваши расценки</span></div><h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Справочник работ</h1><p className="mt-1 text-sm text-slate-500">Добавляйте работы один раз и используйте в любых сметах.</p></div>
        <button className={PRIMARY_BUTTON} onClick={() => setEditing('new')}><Plus size={19} />Добавить работу</button>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-card">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-lg"><Search size={18} className="pointer-events-none absolute left-3.5 top-3.5 text-slate-400" /><input aria-label="Поиск работ" className={`${FIELD} pl-10`} placeholder="Найти работу по названию..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <span className="shrink-0 text-sm font-medium text-slate-500">Всего работ: <strong className="text-ink">{works.length}</strong></span>
        </div>
        {works.length === 0 ? (
          <div className="px-5 py-12 text-center"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><ClipboardList size={32} /></div><h3 className="text-lg font-bold text-ink">Справочник пока пуст</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Добавьте свои расценки или загрузите 10 типовых строительных работ для примера.</p><button disabled={busy || localBusy} className={`${SECONDARY_BUTTON} mt-5`} onClick={() => void run(onSamples)}>{localBusy && <BusyIcon />}Загрузить пример расценок (10 типовых работ)</button></div>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">По запросу ничего не найдено. Попробуйте другое название.</p>
        ) : (
          <div className="table-scroll"><table className="data-table min-w-[750px]"><thead><tr><th className="w-12 text-center"><input type="checkbox" className="check-box" aria-label="Выбрать все показанные работы" checked={allVisibleSelected} onChange={() => onToggleAll(filtered.map((item) => item.id), !allVisibleSelected)} /></th><th>Наименование работы</th><th className="w-28">Ед. изм.</th><th className="w-44 text-right">Цена, ₽</th><th className="w-32 text-center">Действия</th></tr></thead><tbody>{filtered.map((work) => <tr key={work.id} className={selected.has(work.id) ? 'bg-emerald-50/50' : ''}><td className="text-center"><input type="checkbox" className="check-box" checked={selected.has(work.id)} onChange={() => onToggle(work.id)} aria-label={`Выбрать ${work.name}`} /></td><td className="font-semibold text-ink">{work.name}</td><td className="text-slate-600">{work.unit}</td><td className="text-right font-semibold tabular-nums">{money(work.price)}</td><td><div className="flex items-center justify-center gap-1"><button className="icon-button" title="Редактировать" aria-label={`Редактировать ${work.name}`} onClick={() => setEditing(work)}><Edit3 size={18} /></button><button className="icon-button text-rose-600 hover:!bg-rose-50" title="Удалить" aria-label={`Удалить ${work.name}`} onClick={() => setDeleting(work)}><Trash2 size={18} /></button></div></td></tr>)}</tbody></table></div>
        )}
        {works.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4"><button type="button" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand-700 hover:underline" onClick={() => onToggleAll(filtered.map((item) => item.id), !allVisibleSelected)}><CheckSquare size={17} />{allVisibleSelected ? 'Снять выделение' : 'Выбрать все показанные'}</button><span className="text-sm text-slate-500">Выбрано: <strong className="text-ink">{selected.size}</strong></span></div>}
      </div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white p-4 sm:p-6"><div className="flex items-center gap-3"><div className="rounded-xl bg-white p-3 text-brand-700 shadow-sm"><FilePlus2 size={24} /></div><div><h3 className="font-extrabold text-ink">Готовы составить смету?</h3><p className="mt-0.5 text-sm text-slate-500">Отметьте работы галочками — перенесём их в новый документ.</p></div></div><button className={`${PRIMARY_BUTTON} w-full sm:w-auto`} disabled={selected.size === 0 || busy || localBusy} onClick={() => void run(onCreateEstimate)}>Составить смету из выбранных ({selected.size})<ChevronRight size={18} /></button></div>
      {editing && <WorkForm work={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={onSaveWork} />}
      {deleting && <ConfirmDialog title="Удалить расценку?" description={`Работа «${deleting.name}» будет удалена из справочника. В уже созданных сметах она останется с прежней ценой.`} onClose={() => setDeleting(null)} onConfirm={() => onDeleteWork(deleting.id)} />}
    </section>
  );
}
