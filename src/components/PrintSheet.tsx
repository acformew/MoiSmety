import { createPortal } from 'react-dom';
import type { Estimate, EstimateItem } from '../lib/types';
import { formatQty, money, readableDate, sumLine, totals, visibleBuiltIns, visibleCustom } from '../lib/format';

export default function PrintSheet({ estimate, items }: { estimate: Estimate; items: EstimateItem[] }) {
  const builtIns = visibleBuiltIns(estimate);
  const customCols = visibleCustom(estimate);
  const total = totals(items);
  const renderCell = (key: string, item: EstimateItem, index: number) => {
    const sum = sumLine(item);
    switch (key) {
      case 'index': return index + 1;
      case 'name': return item.name;
      case 'unit': return item.unit;
      case 'price': return money(item.unit_price);
      case 'plan': return formatQty(item.planned_qty);
      case 'plan_sum': return money(sum.plan);
      case 'done': return formatQty(item.completed_qty);
      case 'done_sum': return money(sum.completed);
      case 'remaining': return money(sum.remaining);
      case 'note': return item.note || '—';
      default: return item.custom_values?.[key] || '—';
    }
  };
  return createPortal(
    <div id="print-sheet" className="print-sheet">
      <div className="print-header"><div><div className="print-brand">СМЕТА</div><h1>{estimate.title || 'Смета на строительные работы'}</h1></div><div className="print-date">Дата: {readableDate(estimate.estimate_date)}</div></div>
      <div className="print-info"><div><strong>Объект:</strong> {estimate.title || '—'}</div><div><strong>Заказчик:</strong> {estimate.customer || '—'}</div></div>
      <table className="print-table"><thead><tr>{builtIns.map((col) => <th key={col.key}>{col.label}</th>)}{customCols.map((col) => <th key={col.id}>{col.title}</th>)}</tr></thead><tbody>{items.map((item, index) => <tr key={item.id}>{builtIns.map((col) => <td key={col.key} className={['price', 'plan', 'plan_sum', 'done', 'done_sum', 'remaining'].includes(col.key) ? 'number' : ''}>{renderCell(col.key, item, index)}</td>)}{customCols.map((col) => <td key={col.id}>{renderCell(col.id, item, index)}</td>)}</tr>)}</tbody></table>
      <div className="print-total-block"><div><span>Итого по смете:</span><strong>{money(total.plan)}</strong></div><div><span>Выполнено на сумму:</span><strong>{money(total.completed)}</strong></div><div><span>Остаток к оплате:</span><strong>{money(total.remaining)}</strong></div></div>
      <div className="print-signatures"><div><strong>Исполнитель:</strong><span>_______________________ / _______________________</span></div><div><strong>Заказчик:</strong><span>_______________________ / _______________________</span></div></div>
      <div className="print-footer">Документ сформирован в приложении «Смета»</div>
    </div>,
    document.body,
  );
}
