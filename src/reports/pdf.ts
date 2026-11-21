import { reportLines } from "./calculate";
import pdfMake from "pdfmake/build/pdfmake";
import fonts from "pdfmake/build/vfs_fonts";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { native } from "../offline/storage";
import type { Report } from "../offline/model";
import type { Estimate, EstimateItem } from "../lib/types";
import { formatQty, money } from "../lib/format";
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
  const pdf = pdfMake.createPdf(definition);
  if (!native) {
    pdf.download(`MoiSmety-${report.date}.pdf`);
    return;
  }
  const base64 = await new Promise<string>((resolve) => pdf.getBase64(resolve));
  const path = `MoiSmety-${report.id}.pdf`;
  const result = await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Cache,
  });
  await Share.share({ title: "MoiSmety", url: result.uri });
}
export async function estimatePDF(estimate: Estimate, items: EstimateItem[]) {
  await savePDF({
    id: estimate.id,
    user_id: estimate.user_id,
    estimate_id: estimate.id,
    title: estimate.title,
    customer: estimate.customer,
    date: estimate.estimate_date,
    kind: "progress",
    status: "final",
    from: "",
    to: "",
    note: "",
    photos: [],
    created_at: estimate.created_at,
    event_ids: [],
    lines: reportLines(items, [], "progress", "", "").lines,
  });
}
