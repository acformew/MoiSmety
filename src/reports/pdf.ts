import pdfMake from "pdfmake/build/pdfmake";
import fonts from "pdfmake/build/vfs_fonts";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { native } from "../offline/storage";
import type { Report } from "../offline/model";
import type { Estimate, EstimateItem } from "../lib/types";
import {
  formatQty,
  money,
  visibleBuiltIns,
  visibleCustom,
  sumLine,
  totals,
} from "../lib/format";
pdfMake.vfs = fonts as unknown as Record<string, string>;
export async function savePDF(report: Report) {
  const body = [
    [
      "Работа",
      "Ед.",
      "План",
      "Выполнено",
      "%",
      "Цена",
      "Стоимость",
      "Осталось",
      "Примечание",
    ],
    ...report.lines.map((l) => [
      l.name,
      l.unit,
      formatQty(l.planned),
      formatQty(l.completed),
      formatQty(l.percent),
      money(l.price),
      money(l.amount),
      formatQty(l.remaining),
      l.note,
    ]),
  ];
  const definition: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: "landscape",
    defaultStyle: { font: "Roboto", fontSize: 9 },
    content: [
      { text: report.title, fontSize: 18, bold: true },
      {
        text: `Заказчик ${report.customer}\nДата ${report.date}\n${report.kind === "period" ? `За период ${report.from} — ${report.to}` : "Общий прогресс"}`,
        margin: [0, 10],
      },
      {
        table: {
          headerRows: 1,
          widths: ["*", 25, 40, 45, 30, 55, 60, 40, 65],
          body,
        },
      },
      {
        text: `Итого ${money(report.lines.reduce((sum, l) => sum + l.amount, 0))}`,
        bold: true,
        margin: [0, 15],
      },
      { text: report.note },
      {
        text: "Исполнитель ____________________     Заказчик ____________________",
        margin: [0, 30],
      },
      ...report.photos.map((data) => ({
        image: data,
        fit: [500, 300] as [number, number],
        margin: [0, 10] as [number, number],
      })),
    ],
  };
  await deliverPDF(definition, report.id, report.date);
}
async function deliverPDF(
  definition: TDocumentDefinitions,
  id: string,
  date: string,
) {
  const pdf = pdfMake.createPdf(definition);
  if (!native) {
    pdf.download(`MoiSmety-${date}.pdf`);
    return;
  }
  const base64 = await new Promise<string>((resolve) => pdf.getBase64(resolve));
  const path = `MoiSmety-${id}.pdf`;
  const result = await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Cache,
  });
  await Share.share({ title: "MoiSmety", url: result.uri });
}
export async function estimatePDF(estimate: Estimate, items: EstimateItem[]) {
  const columns = [
    ...visibleBuiltIns(estimate),
    ...visibleCustom(estimate).map((c) => ({ key: c.id, label: c.title })),
  ];
  const body = [
    columns.map((c) => c.label),
    ...items.map((item, index) => {
      const sums = sumLine(item);
      const values: Record<string, string> = {
        index: String(index + 1),
        name: item.name,
        unit: item.unit,
        price: money(item.unit_price),
        plan: formatQty(item.planned_qty),
        plan_sum: money(sums.plan),
        done: formatQty(item.completed_qty),
        done_sum: money(sums.completed),
        remaining: money(sums.remaining),
        note: item.note,
      };
      return columns.map(
        (c) => values[c.key] ?? item.custom_values[c.key] ?? "",
      );
    }),
  ];
  const total = totals(items);
  const definition: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: "landscape",
    defaultStyle: { font: "Roboto", fontSize: 8 },
    content: [
      { text: estimate.title, fontSize: 18, bold: true },
      {
        text: `Заказчик ${estimate.customer}\nДата ${estimate.estimate_date}`,
        margin: [0, 12],
      },
      { table: { headerRows: 1, widths: columns.map(() => "*"), body } },
      {
        text: `По плану ${money(total.plan)}\nВыполнено ${money(total.completed)}\nОстаток ${money(total.remaining)}`,
        margin: [0, 15],
      },
      {
        text: "Исполнитель ____________________     Заказчик ____________________",
        margin: [0, 30],
      },
    ],
  };
  await deliverPDF(definition, estimate.id, estimate.estimate_date);
}
