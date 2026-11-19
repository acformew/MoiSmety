import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Check, ChevronDown, LoaderCircle, X } from 'lucide-react';
import { UNITS } from '../lib/types';
import { canTypeNumber, safeNumber } from '../lib/format';

export const PRIMARY_BUTTON = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50';
export const SECONDARY_BUTTON = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
export const DANGER_BUTTON = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50';
export const FIELD = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`max-h-[94dvh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6 ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-ink">{title}</h2>
          <button type="button" aria-label="Закрыть окно" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, description, action = 'Удалить', onClose, onConfirm }: {
  title: string;
  description: string;
  action?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось удалить запись.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal title={title} onClose={() => { if (!loading) onClose(); }}>
      <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-amber-900">
        <AlertTriangle className="mt-0.5 shrink-0" size={22} />
        <p className="text-sm leading-6">{description}</p>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className={SECONDARY_BUTTON} disabled={loading}>Отмена</button>
        <button type="button" onClick={handleConfirm} className={DANGER_BUTTON} disabled={loading}>
          {loading ? <LoaderCircle size={18} className="animate-spin" /> : null}{action}
        </button>
      </div>
    </Modal>
  );
}

export function UnitEditor({ value, onChange, compact = false }: { value: string; onChange: (value: string) => void; compact?: boolean }) {
  const custom = !UNITS.includes(value);
  return (
    <div className={`flex ${compact ? 'min-w-[118px]' : 'w-full'} flex-col gap-1`}>
      <div className="relative">
        <select aria-label="Единица измерения" className={`${FIELD} appearance-none pr-8 ${compact ? '!min-h-9 !rounded-lg !px-2 !py-1' : ''}`}
          value={custom ? '__other__' : value}
          onChange={(event) => onChange(event.target.value === '__other__' ? '' : event.target.value)}>
          {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          <option value="__other__">Своя единица...</option>
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>
      {custom && (
        <input aria-label="Своя единица измерения" className={`${FIELD} ${compact ? '!min-h-9 !rounded-lg !px-2 !py-1' : ''}`}
          placeholder="Например, ведро" maxLength={40} value={value} onChange={(event) => onChange(event.target.value)} onBlur={() => { if (!value.trim()) onChange(UNITS[0]); }} />
      )}
    </div>
  );
}

export function NumericInput({ value, onChange, decimals = 3, label, compact = false }: {
  value: number;
  onChange: (value: number) => void;
  decimals?: number;
  label: string;
  compact?: boolean;
}) {
  const [raw, setRaw] = useState(String(value ?? 0));
  const sentValue = useRef(value);
  useEffect(() => {
    // Не стираем промежуточный ввод «12,» при собственном обновлении числа.
    if (value !== sentValue.current) {
      setRaw(String(value ?? 0));
      sentValue.current = value;
    }
  }, [value]);
  return (
    <input
      type="text"
      aria-label={label}
      inputMode="decimal"
      autoComplete="off"
      className={`${FIELD} min-w-[90px] text-right tabular-nums ${compact ? '!min-h-9 !rounded-lg !px-2 !py-1' : ''}`}
      value={raw}
      onChange={(event) => {
        const next = event.target.value.trim();
        if (!canTypeNumber(next, decimals)) return;
        setRaw(next);
        const numeric = safeNumber(next, decimals);
        sentValue.current = numeric;
        onChange(numeric);
      }}
      onBlur={() => {
        const normalized = safeNumber(raw, decimals);
        sentValue.current = normalized;
        setRaw(String(normalized));
        onChange(normalized);
      }}
    />
  );
}

export function BusyIcon({ className = '' }: { className?: string }) {
  return <LoaderCircle size={18} className={`animate-spin ${className}`} aria-hidden="true" />;
}

export function SavedIndicator({ status, onRetry }: { status: 'saved' | 'saving' | 'error'; onRetry: () => void }) {
  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${status === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : status === 'saving' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`} aria-live="polite">
      {status === 'saving' ? <BusyIcon className="!h-3.5 !w-3.5" /> : status === 'saved' ? <Check size={14} /> : <AlertTriangle size={14} />}
      {status === 'saving' ? 'Сохранение...' : status === 'saved' ? 'Сохранено' : 'Не сохранено'}
      {status === 'error' && <button type="button" className="underline" onClick={onRetry}>Повторить</button>}
    </div>
  );
}
