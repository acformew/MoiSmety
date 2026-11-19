import { useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, FileSpreadsheet, Search, Trash2, UserRound } from 'lucide-react';
import type { Estimate, EstimateItem } from '../lib/types';
import { money, readableDate, totals } from '../lib/format';
import { ConfirmDialog, FIELD, PRIMARY_BUTTON } from './UI';

export default function EstimateList({ estimates, items, onOpen, onDelete, onGoToLibrary }: {
  estimates: Estimate[];
  items: EstimateItem[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onGoToLibrary: () => void;
}) {
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<Estimate | null>(null);
  const filtered = useMemo(() => estimates.filter((estimate) => `${estimate.title} ${estimate.customer}`.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')))
    .sort((a, b) => b.created_at.localeCompare(a.created_at)), [estimates, search]);
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="mb-1 flex items-center gap-2 text-brand-700"><FileSpreadsheet size={19} /><span className="text-xs font-extrabold uppercase tracking-widest">Документы</span></div><h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Мои сметы</h1><p className="mt-1 text-sm text-slate-500">Сохранённые объекты, плановые суммы и выполненные работы.</p></div><button className={PRIMARY_BUTTON} onClick={onGoToLibrary}>+ Новая смета</button></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card"><div className="relative max-w-lg"><Search size={18} className="pointer-events-none absolute left-3.5 top-3.5 text-slate-400" /><input className={`${FIELD} pl-10`} placeholder="Поиск по объекту или заказчику..." aria-label="Поиск смет" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>
      {filtered.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-card"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><FileSpreadsheet size={30} /></div><h3 className="text-lg font-bold text-ink">{estimates.length === 0 ? 'Пока нет ни одной сметы' : 'По запросу ничего не найдено'}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{estimates.length === 0 ? 'Откройте справочник, выберите нужные работы и нажмите «Составить смету».' : 'Измените текст поиска.'}</p>{estimates.length === 0 && <button className={`${PRIMARY_BUTTON} mt-5`} onClick={onGoToLibrary}>Перейти к справочнику</button>}</div> : (
        <div className="grid gap-3">{filtered.map((estimate) => {
          const estimateItems = items.filter((item) => item.estimate_id === estimate.id);
          const total = totals(estimateItems);
          return (
            <article key={estimate.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition hover:border-brand-200 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h2 className="break-words text-lg font-bold text-ink">{estimate.title || 'Без названия'}</h2><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><CalendarDays size={14} />{readableDate(estimate.estimate_date)}</span><span className="inline-flex items-center gap-1.5"><UserRound size={14} />{estimate.customer || 'Заказчик не указан'}</span><span>{estimateItems.length} позиций</span></div></div><button title="Удалить смету" aria-label={`Удалить смету ${estimate.title}`} className="icon-button text-rose-600 hover:!bg-rose-50" onClick={() => setDeleting(estimate)}><Trash2 size={19} /></button></div>
              <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"><div><div className="text-xs text-slate-500">По плану</div><div className="mt-1 text-base font-bold text-ink tabular-nums">{money(total.plan)}</div></div><div><div className="text-xs text-slate-500">Выполнено</div><div className="mt-1 text-base font-bold text-brand-700 tabular-nums">{money(total.completed)}</div></div><div><div className="text-xs text-slate-500">Остаток</div><div className={`mt-1 text-base font-bold tabular-nums ${total.remaining < 0 ? 'text-rose-700' : 'text-ink'}`}>{money(total.remaining)}</div></div><button className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-bold text-brand-700 hover:bg-brand-100" onClick={() => onOpen(estimate.id)}>Открыть <ChevronRight size={18} /></button></div>
            </article>
          );
        })}</div>
      )}
      {deleting && <ConfirmDialog title="Удалить смету?" description={`Смета «${deleting.title || 'Без названия'}» и все её позиции будут удалены без возможности восстановления. Справочник расценок не изменится.`} onClose={() => setDeleting(null)} onConfirm={() => onDelete(deleting.id)} />}
    </section>
  );
}
