import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, CalendarDays, Check, Columns3, FilePlus2, FileText, Plus, Printer, Search, Settings2, Trash2, UserRound } from 'lucide-react';
import type { ColumnConfig, CustomColumn, Estimate, EstimateItem, WorkItem } from '../lib/types';
import { BUILT_IN_COLUMNS } from '../lib/types';
import { money, sumLine, totals, visibleBuiltIns, visibleCustom } from '../lib/format';
import { BusyIcon, ConfirmDialog, FIELD, Modal, NumericInput, PRIMARY_BUTTON, SECONDARY_BUTTON, UnitEditor } from './UI';
import PrintSheet from './PrintSheet';

function ColumnDesigner({ estimate, onChange, onClose }: {
  estimate: Estimate;
  onChange: (patch: Partial<Estimate>) => void;
  onClose: () => void;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [toDelete, setToDelete] = useState<CustomColumn | null>(null);
  const toggle = (key: string, value: boolean) => onChange({ columns_config: { ...estimate.columns_config, [key]: value } });
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!newTitle.trim()) return;
    const id = `custom_${Math.random().toString(36).slice(2, 12)}_${Date.now().toString(36)}`;
    onChange({
      custom_columns: [...(estimate.custom_columns ?? []), { id, title: newTitle.trim().slice(0, 70) }],
      columns_config: { ...estimate.columns_config, [id]: true },
    });
    setNewTitle('');
  };
  const remove = () => {
    if (!toDelete) return;
    const config: ColumnConfig = { ...estimate.columns_config };
    delete config[toDelete.id];
    onChange({ custom_columns: (estimate.custom_columns ?? []).filter((col) => col.id !== toDelete.id), columns_config: config });
    setToDelete(null);
  };
  return (
    <Modal title="Настроить колонки" onClose={onClose}>
      <p className="mb-4 text-sm leading-6 text-slate-500">Выберите, какие колонки показывать в редакторе и в печатной форме. Основные колонки всегда видимы.</p>
      <div className="space-y-1">{BUILT_IN_COLUMNS.map((column) => <label key={column.key} className="flex min-h-10 items-center gap-3 rounded-lg px-2 hover:bg-slate-50"><input type="checkbox" className="check-box" checked={column.required || estimate.columns_config?.[column.key] !== false} disabled={column.required} onChange={(event) => toggle(column.key, event.target.checked)} /><span className="flex-1 text-sm font-medium text-slate-700">{column.label}</span>{column.required && <span className="text-xs text-slate-400">Обязательно</span>}</label>)}</div>
      <div className="my-5 border-t border-slate-100" />
      <h3 className="mb-2 text-sm font-bold text-ink">Свои колонки</h3>
      <div className="space-y-1">{(estimate.custom_columns ?? []).map((col) => <div key={col.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50"><label className="flex min-h-9 flex-1 items-center gap-3"><input type="checkbox" className="check-box" checked={estimate.columns_config?.[col.id] !== false} onChange={(event) => toggle(col.id, event.target.checked)} /><span className="break-words text-sm font-medium text-slate-700">{col.title}</span></label><button className="icon-button text-rose-600" aria-label={`Удалить колонку ${col.title}`} onClick={() => setToDelete(col)}><Trash2 size={17} /></button></div>)}{(estimate.custom_columns ?? []).length === 0 && <p className="py-1 text-sm text-slate-400">Дополнительных колонок пока нет.</p>}</div>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={add}><input className={`${FIELD} min-w-[170px] flex-1`} value={newTitle} maxLength={70} onChange={(event) => setNewTitle(event.target.value)} placeholder="Например, Материал" aria-label="Название новой колонки" /><button className={SECONDARY_BUTTON} type="submit" disabled={!newTitle.trim()}><Plus size={17} />Добавить</button></form>
      <div className="mt-6 flex justify-end"><button className={PRIMARY_BUTTON} type="button" onClick={onClose}><Check size={18} />Готово</button></div>
      {toDelete && <ConfirmDialog title="Удалить колонку?" description={`Колонка «${toDelete.title}» исчезнет из таблицы и печатной формы. Значения в старых строках сохранятся в базе, но больше не будут отображаться.`} onClose={() => setToDelete(null)} onConfirm={async () => remove()} />}
    </Modal>
  );
}

function WorkPicker({ works, onAdd, onClose }: { works: WorkItem[]; onAdd: (works: WorkItem[]) => Promise<void>; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const filtered = useMemo(() => works.filter((work) => work.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))), [works, search]);
  const add = async () => {
    setBusy(true);
    setError('');
    try { await onAdd(works.filter((item) => selected.has(item.id))); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось добавить работы.'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Добавить работы из справочника" onClose={onClose} wide>
      <div className="relative mb-4"><Search size={18} className="pointer-events-none absolute left-3.5 top-3.5 text-slate-400" /><input className={`${FIELD} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти работу..." aria-label="Поиск в справочнике" /></div>
      <div className="max-h-[45vh] space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-1">{filtered.map((work) => <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg px-3 hover:bg-slate-50" key={work.id}><input type="checkbox" className="check-box" checked={selected.has(work.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(work.id)) next.delete(work.id); else next.add(work.id); return next; })} /><div className="min-w-0 flex-1"><div className="break-words text-sm font-semibold text-ink">{work.name}</div><div className="text-xs text-slate-500">{work.unit}</div></div><div className="shrink-0 text-sm font-semibold tabular-nums">{money(work.price)}</div></label>)}{filtered.length === 0 && <p className="p-4 text-center text-sm text-slate-500">{works.length === 0 ? 'Справочник пуст. Добавьте работу вручную или вернитесь в справочник.' : 'Ничего не найдено.'}</p>}</div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button className={SECONDARY_BUTTON} onClick={onClose} disabled={busy}>Отмена</button><button className={PRIMARY_BUTTON} disabled={busy || selected.size === 0} onClick={() => void add()}>{busy && <BusyIcon />}Добавить ({selected.size})</button></div>
    </Modal>
  );
}

export default function EstimateEditor({ estimate, items, works, busy, onBack, onUpdateEstimate, onUpdateItem, onAddWorks, onAddManual, onRemoveItem }: {
  estimate: Estimate;
  items: EstimateItem[];
  works: WorkItem[];
  busy: boolean;
  onBack: () => void;
  onUpdateEstimate: (patch: Partial<Estimate>) => void;
  onUpdateItem: (id: string, patch: Partial<EstimateItem>) => void;
  onAddWorks: (works: WorkItem[]) => Promise<void>;
  onAddManual: () => Promise<void>;
  onRemoveItem: (id: string) => Promise<void>;
}) {
  const [showColumns, setShowColumns] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [deleting, setDeleting] = useState<EstimateItem | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const cols = visibleBuiltIns(estimate);
  const custom = visibleCustom(estimate);
  const total = totals(items);
  const runManual = async () => { setAdding(true); setError(''); try { await onAddManual(); } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось добавить строку.'); } finally { setAdding(false); } };
  const updateName = (item: EstimateItem, raw: string) => {
    if (raw.trim()) onUpdateItem(item.id, { name: raw });
    else onUpdateItem(item.id, { name: '' });
  };
  const renderCell = (key: string, item: EstimateItem, index: number) => {
    const value = sumLine(item);
    switch (key) {
      case 'index': return <span className="font-semibold text-slate-400">{index + 1}</span>;
      case 'name': return <input className="table-input min-w-[240px] font-medium text-ink" aria-label={`Наименование работы ${index + 1}`} maxLength={250} value={item.name} onChange={(event) => updateName(item, event.target.value)} onBlur={() => { if (!item.name.trim()) onUpdateItem(item.id, { name: 'Без названия' }); }} />;
      case 'unit': return <UnitEditor compact value={item.unit} onChange={(text) => onUpdateItem(item.id, { unit: text })} />;
      case 'price': return <NumericInput compact decimals={2} value={item.unit_price} label={`Цена работы ${index + 1}`} onChange={(n) => onUpdateItem(item.id, { unit_price: n })} />;
      case 'plan': return <NumericInput compact value={item.planned_qty} label={`План работы ${index + 1}`} onChange={(n) => onUpdateItem(item.id, { planned_qty: n })} />;
      case 'plan_sum': return <span className="whitespace-nowrap font-semibold tabular-nums">{money(value.plan)}</span>;
      case 'done': return <NumericInput compact value={item.completed_qty} label={`Выполнено работы ${index + 1}`} onChange={(n) => onUpdateItem(item.id, { completed_qty: n })} />;
      case 'done_sum': return <span className="whitespace-nowrap font-semibold text-brand-700 tabular-nums">{money(value.completed)}</span>;
      case 'remaining': return <span className={`whitespace-nowrap font-semibold tabular-nums ${value.remaining < 0 ? 'text-rose-700' : ''}`}>{money(value.remaining)}</span>;
      case 'note': return <input className="table-input min-w-[150px]" maxLength={2000} value={item.note} placeholder="Примечание..." aria-label={`Примечание работы ${index + 1}`} onChange={(event) => onUpdateItem(item.id, { note: event.target.value })} />;
      default: return <input className="table-input min-w-[130px]" maxLength={1000} value={item.custom_values?.[key] ?? ''} aria-label={`Значение колонки ${key} для работы ${index + 1}`} onChange={(event) => onUpdateItem(item.id, { custom_values: { ...(item.custom_values ?? {}), [key]: event.target.value } })} />;
    }
  };
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><button className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-slate-600 hover:text-brand-700" onClick={onBack}><ArrowLeft size={18} />К моим сметам</button><div className="flex flex-wrap gap-2"><button type="button" className={SECONDARY_BUTTON} onClick={() => setShowColumns(true)}><Settings2 size={18} />Настроить колонки</button><button type="button" className={PRIMARY_BUTTON} onClick={() => window.print()}><Printer size={18} />Печать / Сохранить в PDF</button></div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-6"><div className="mb-5 flex items-center gap-2"><div className="rounded-xl bg-brand-50 p-2 text-brand-700"><FileText size={21} /></div><div><h1 className="text-xl font-extrabold text-ink">Смета на работы</h1><p className="text-xs text-slate-500">Изменения сохраняются автоматически</p></div></div><div className="grid gap-4 md:grid-cols-[1.4fr_1fr_0.7fr]"><label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Название объекта</span><input className={FIELD} value={estimate.title} maxLength={250} onChange={(event) => onUpdateEstimate({ title: event.target.value })} placeholder="Например, квартира на Ленина, 15" /></label><label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><UserRound size={15} />Заказчик</span><input className={FIELD} value={estimate.customer} maxLength={250} onChange={(event) => onUpdateEstimate({ customer: event.target.value })} placeholder="Имя заказчика" /></label><label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><CalendarDays size={15} />Дата сметы</span><input type="date" className={FIELD} value={estimate.estimate_date} onChange={(event) => { if (event.target.value) onUpdateEstimate({ estimate_date: event.target.value }); }} /></label></div></div>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-card"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><h2 className="font-extrabold text-ink">Позиции сметы <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{items.length}</span></h2><p className="mt-1 text-xs text-slate-500">Прокручивайте таблицу вправо, чтобы увидеть все столбцы.</p></div><div className="flex flex-wrap gap-2"><button type="button" className={SECONDARY_BUTTON} onClick={() => setShowPicker(true)}><FilePlus2 size={17} />Из справочника</button><button type="button" className={SECONDARY_BUTTON} disabled={busy || adding} onClick={() => void runManual()}>{adding ? <BusyIcon /> : <Plus size={17} />}Вписать вручную</button></div></div>
        <div className="table-scroll"><table className="data-table estimate-table"><thead><tr>{cols.map((col) => <th key={col.key} className={['price', 'plan', 'plan_sum', 'done', 'done_sum', 'remaining'].includes(col.key) ? 'text-right' : ''}>{col.label}</th>)}{custom.map((col) => <th key={col.id}>{col.title}</th>)}<th className="sticky-action text-center">Удалить</th></tr></thead><tbody>{items.map((item, index) => <tr key={item.id}>{cols.map((col) => <td key={col.key} className={['price', 'plan', 'plan_sum', 'done', 'done_sum', 'remaining'].includes(col.key) ? 'text-right' : ''}>{renderCell(col.key, item, index)}</td>)}{custom.map((col) => <td key={col.id}>{renderCell(col.id, item, index)}</td>)}<td className="sticky-action text-center"><button className="icon-button text-rose-600 hover:!bg-rose-50" title="Удалить строку" aria-label={`Удалить строку ${index + 1}`} onClick={() => setDeleting(item)}><Trash2 size={17} /></button></td></tr>)}{items.length === 0 && <tr><td colSpan={cols.length + custom.length + 1} className="!py-12 text-center text-sm text-slate-500">В смете пока нет строк. Добавьте работу из справочника или впишите вручную.</td></tr>}</tbody></table></div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-4 text-xs text-slate-500"><Columns3 size={16} />В таблице показано {cols.length + custom.length} столбцов. Для печати используются те же видимые колонки.</div>
      </div>
      {error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-3"><div className="total-card"><div>Итого по смете</div><strong>{money(total.plan)}</strong><small>Плановая стоимость</small></div><div className="total-card"><div>Выполнено на сумму</div><strong className="!text-brand-700">{money(total.completed)}</strong><small>Стоимость сделанного</small></div><div className="total-card"><div>Остаток к оплате</div><strong className={total.remaining < 0 ? '!text-rose-700' : ''}>{money(total.remaining)}</strong><small>План − выполнено</small></div></div>
      <p className="text-xs leading-5 text-slate-500">Цена каждой позиции хранится отдельно от справочника. Изменение расценки в справочнике не меняет сохранённые сметы. Отрицательный остаток означает, что объём выполненных работ превысил план.</p>
      {showColumns && <ColumnDesigner estimate={estimate} onChange={onUpdateEstimate} onClose={() => setShowColumns(false)} />}
      {showPicker && <WorkPicker works={works} onAdd={onAddWorks} onClose={() => setShowPicker(false)} />}
      {deleting && <ConfirmDialog title="Удалить строку сметы?" description={`Работа «${deleting.name}» будет удалена только из этой сметы. В справочнике она останется.`} onClose={() => setDeleting(null)} onConfirm={() => onRemoveItem(deleting.id)} />}
      <PrintSheet estimate={estimate} items={items} />
    </section>
  );
}
