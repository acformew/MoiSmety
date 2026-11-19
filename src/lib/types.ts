export interface WorkItem {
  id: string;
  user_id: string;
  name: string;
  unit: string;
  price: number;
  created_at: string;
  updated_at: string;
}

export interface CustomColumn {
  id: string;
  title: string;
}

export type OptionalColumn = 'unit' | 'done' | 'done_sum' | 'remaining' | 'note';
export type BuiltInColumn =
  | 'index'
  | 'name'
  | 'unit'
  | 'price'
  | 'plan'
  | 'plan_sum'
  | 'done'
  | 'done_sum'
  | 'remaining'
  | 'note';

export type ColumnConfig = Record<string, boolean>;

export const BUILT_IN_COLUMNS: {
  key: BuiltInColumn;
  label: string;
  required: boolean;
}[] = [
  { key: 'index', label: '№ п/п', required: true },
  { key: 'name', label: 'Наименование работы', required: true },
  { key: 'unit', label: 'Ед. изм.', required: false },
  { key: 'price', label: 'Цена за ед.', required: true },
  { key: 'plan', label: 'План, кол-во', required: true },
  { key: 'plan_sum', label: 'Стоимость по плану', required: true },
  { key: 'done', label: 'Выполнено, кол-во', required: false },
  { key: 'done_sum', label: 'Сумма выполненных', required: false },
  { key: 'remaining', label: 'Остаток', required: false },
  { key: 'note', label: 'Примечание', required: false },
];

export const DEFAULT_COLUMNS: ColumnConfig = {
  unit: true,
  done: true,
  done_sum: true,
  remaining: true,
  note: true,
};

export interface Estimate {
  id: string;
  user_id: string;
  title: string;
  customer: string;
  estimate_date: string;
  columns_config: ColumnConfig;
  custom_columns: CustomColumn[];
  created_at: string;
  updated_at: string;
}

export interface EstimateItem {
  id: string;
  user_id: string;
  estimate_id: string;
  position: number;
  name: string;
  unit: string;
  unit_price: number;
  planned_qty: number;
  completed_qty: number;
  note: string;
  custom_values: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export type DraftWork = Pick<WorkItem, 'name' | 'unit' | 'price'>;

export const UNITS = [
  'м²', 'м³', 'м.п.', 'м', 'см', 'мм', 'шт.', 'кг', 'т', 'л', 'компл.',
  'точка', 'смена', 'час', 'сутки', 'рейс', 'упак.', 'мешок', 'лист',
];

export const SAMPLE_WORKS: DraftWork[] = [
  { name: 'Демонтаж старой штукатурки', unit: 'м²', price: 350 },
  { name: 'Грунтовка стен', unit: 'м²', price: 95 },
  { name: 'Штукатурка стен по маякам', unit: 'м²', price: 780 },
  { name: 'Шпаклёвка стен под покраску', unit: 'м²', price: 520 },
  { name: 'Покраска стен в два слоя', unit: 'м²', price: 340 },
  { name: 'Укладка керамической плитки', unit: 'м²', price: 1750 },
  { name: 'Монтаж ламината', unit: 'м²', price: 480 },
  { name: 'Монтаж плинтуса', unit: 'м.п.', price: 210 },
  { name: 'Установка розетки', unit: 'точка', price: 650 },
  { name: 'Монтаж светильника', unit: 'шт.', price: 950 },
];
