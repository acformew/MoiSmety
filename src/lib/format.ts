import { BUILT_IN_COLUMNS, DEFAULT_COLUMNS } from './types';
import type { ColumnConfig, Estimate, EstimateItem } from './types';

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const numberFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 3,
});

export function money(value: number): string {
  return `${moneyFormatter.format(Number.isFinite(value) ? value : 0)} ₽`;
}

export function formatQty(value: number): string {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}

export function safeNumber(raw: string | number, decimals = 3): number {
  const value = typeof raw === 'number' ? raw : Number(raw.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return 0;
  const multiplier = Math.pow(10, decimals);
  return Math.round(Math.min(value, 9999999999) * multiplier) / multiplier;
}

export function canTypeNumber(raw: string, decimals = 3): boolean {
  return new RegExp(`^\\d*(?:[.,]\\d{0,${decimals}})?$`).test(raw);
}

export function sumLine(item: EstimateItem) {
  const plan = Math.round(Number(item.unit_price) * Number(item.planned_qty) * 100) / 100;
  const completed = Math.round(Number(item.unit_price) * Number(item.completed_qty) * 100) / 100;
  return { plan, completed, remaining: Math.round((plan - completed) * 100) / 100 };
}

export function totals(items: EstimateItem[]) {
  return items.reduce(
    (acc, item) => {
      const value = sumLine(item);
      acc.plan += value.plan;
      acc.completed += value.completed;
      acc.remaining += value.remaining;
      return acc;
    },
    { plan: 0, completed: 0, remaining: 0 },
  );
}

export function localToday(): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function readableDate(date: string): string {
  if (!date) return '—';
  const pieces = date.slice(0, 10).split('-');
  return pieces.length === 3 ? `${pieces[2]}.${pieces[1]}.${pieces[0]}` : date;
}

export function visibleBuiltIns(estimate: Estimate) {
  const config: ColumnConfig = { ...DEFAULT_COLUMNS, ...(estimate.columns_config ?? {}) };
  return BUILT_IN_COLUMNS.filter((column) => column.required || config[column.key] !== false);
}

export function visibleCustom(estimate: Estimate) {
  return (estimate.custom_columns ?? []).filter((col) => estimate.columns_config?.[col.id] !== false);
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Не удалось выполнить операцию. Проверьте соединение с интернетом.';
  const message = error.message;
  if (/Invalid login credentials/i.test(message)) return 'Неверная почта или пароль.';
  if (/Email not confirmed/i.test(message)) return 'Почта ещё не подтверждена. Проверьте настройки подтверждения в Supabase.';
  if (/User already registered/i.test(message)) return 'Пользователь с такой почтой уже зарегистрирован.';
  if (/Password should be at least/i.test(message)) return 'Пароль слишком короткий. Используйте минимум 6 символов.';
  if (/Unable to validate email address|invalid email/i.test(message)) return 'Введите корректный адрес электронной почты.';
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(message)) return 'Слишком много запросов. Попробуйте немного позже.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return 'Нет соединения с сервером. Проверьте интернет.';
  if (/duplicate key/i.test(message)) return 'Такая запись уже существует.';
  if (/row-level security|permission denied/i.test(message)) return 'Нет доступа к записи. Проверьте, что SQL-скрипт настроен правильно.';
  return `Ошибка: ${message}`;
}

export function sortRows(rows: EstimateItem[]): EstimateItem[] {
  return [...rows].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
}
