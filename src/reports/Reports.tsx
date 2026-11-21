import { useEffect, useState } from "react";
import type { Snapshot, Report } from "../offline/model";
import { reportLines } from "./calculate";
import { savePDF } from "./pdf";
import { localToday, money, formatQty } from "../lib/format";
import { FIELD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../components/UI";
export default function Reports({
  data,
  user,
  commit,
}: {
  data: Snapshot;
  user: string;
  commit: (edit: (data: Snapshot) => void) => Promise<void>;
}) {
  const [active, setActive] = useState<string>();
  const [estimate, setEstimate] = useState(data.estimates[0]?.id ?? "");
  const [kind, setKind] = useState<Report["kind"]>("progress");
  const [from, setFrom] = useState(localToday());
  const [to, setTo] = useState(localToday());
  const [all, setAll] = useState(true);
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const back = (event: Event) => {
      if (active) {
        event.preventDefault();
        setActive(undefined);
      }
    };
    window.addEventListener("moismety-back", back);
    return () => window.removeEventListener("moismety-back", back);
  }, [active]);
  const report = data.reports.find((r) => r.id === active);
  const items = data.estimate_items.filter((i) => i.estimate_id === estimate);
  const run = async (action: () => Promise<unknown>) => {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const create = async () => {
    const source = data.estimates.find((e) => e.id === estimate);
    if (!source) throw Error("Выберите смету");
    const selected = items.filter((i) => all || ids.includes(i.id));
    if (!selected.length) throw Error("Выберите работы");
    const used = new Set(
      data.reports
        .filter((r) => r.status === "final" && r.kind === "period")
        .flatMap((r) => r.event_ids),
    );
    const result = reportLines(
      selected,
      data.completions,
      kind,
      from,
      to,
      used,
    );
    const id = crypto.randomUUID();
    await commit((d) => {
      d.reports.push({
        id,
        user_id: user,
        estimate_id: estimate,
        title: source.title,
        customer: source.customer,
        date: localToday(),
        from,
        to,
        kind,
        status: "draft",
        note: "",
        lines: result.lines,
        event_ids: result.eventIds,
        photos: [],
        created_at: new Date().toISOString(),
      });
    });
    setActive(id);
  };
  const patch = (values: Partial<Report>) =>
    run(() =>
      commit((d) => {
        const row = d.reports.find((r) => r.id === active);
        if (row?.status === "draft") Object.assign(row, values);
      }),
    );
  const attach = async (file: File) => {
    if (!["image/jpeg", "image/png"].includes(file.type))
      throw Error("Выберите JPEG или PNG");
    if (file.size > 2 * 1024 * 1024)
      throw Error("Размер фотографии должен быть до 2 МБ");
    const image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await commit((d) => {
      const row = d.reports.find((r) => r.id === active);
      if (!row || row.status !== "draft") return;
      d.report_photos.push({
        id: crypto.randomUUID(),
        user_id: user,
        report_id: row.id,
        data: image,
        created_at: new Date().toISOString(),
      });
    });
  };
  const photos = data.report_photos.filter((p) => p.report_id === report?.id);
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Отчёты о выполненных работах</h1>
      {error && (
        <p role="alert" className="text-rose-700">
          {error}
        </p>
      )}
      {report ? (
        <>
          <button
            className={SECONDARY_BUTTON}
            onClick={() => setActive(undefined)}
          >
            К истории отчётов
          </button>
          <p>
            {report.status === "draft" ? "Черновик" : "Сформированный документ"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["title", "customer", "date", "note"] as const).map(
              (key, index) => (
                <label key={key}>
                  {
                    ["Объект", "Заказчик", "Дата составления", "Комментарий"][
                      index
                    ]
                  }
                  <input
                    className={FIELD}
                    type={key === "date" ? "date" : "text"}
                    disabled={report.status === "final"}
                    value={report[key]}
                    onChange={(e) => void patch({ [key]: e.target.value })}
                  />
                </label>
              ),
            )}
          </div>
          <p>
            {report.kind === "period"
              ? `За период ${report.from} — ${report.to}`
              : "Общий прогресс"}
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    "Работа",
                    "Ед.",
                    "План",
                    "Выполнено",
                    "%",
                    "Цена",
                    "Стоимость",
                    "Осталось",
                    "Примечание",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.name}</td>
                    <td>{l.unit}</td>
                    <td>{formatQty(l.planned)}</td>
                    <td>{formatQty(l.completed)}</td>
                    <td>{formatQty(l.percent)}</td>
                    <td>{money(l.price)}</td>
                    <td>{money(l.amount)}</td>
                    <td>{formatQty(l.remaining)}</td>
                    <td>
                      {report.status === "draft" ? (
                        <input
                          aria-label={`Примечание ${l.name}`}
                          value={l.note}
                          onChange={(e) =>
                            void patch({
                              lines: report.lines.map((line) =>
                                line.id === l.id
                                  ? { ...line, note: e.target.value }
                                  : line,
                              ),
                            })
                          }
                        />
                      ) : (
                        l.note
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="font-bold">
            Итого {money(report.lines.reduce((sum, l) => sum + l.amount, 0))}
          </p>
          <div className="flex flex-wrap gap-3">
            {photos.map((p) => (
              <img
                key={p.id}
                className="h-32 max-w-full object-contain"
                src={p.data}
                alt="Фото выполненных работ"
              />
            ))}
          </div>
          {report.status === "draft" && (
            <>
              <button
                className={SECONDARY_BUTTON}
                onClick={() =>
                  void patch(
                    (() => {
                      const selected = data.estimate_items.filter(
                        (i) =>
                          i.estimate_id === report.estimate_id &&
                          report.lines.some((l) => l.id === i.id),
                      );
                      const used = new Set(
                        data.reports
                          .filter(
                            (r) =>
                              r.id !== report.id &&
                              r.status === "final" &&
                              r.kind === "period",
                          )
                          .flatMap((r) => r.event_ids),
                      );
                      const updated = reportLines(
                        selected,
                        data.completions,
                        report.kind,
                        report.from,
                        report.to,
                        used,
                      );
                      return {
                        lines: updated.lines,
                        event_ids: updated.eventIds,
                      };
                    })(),
                  )
                }
              >
                Обновить черновик из сметы
              </button>
              <button
                className={SECONDARY_BUTTON}
                onClick={() =>
                  void run(async () => {
                    if (!window.confirm("Удалить черновик и его фотографии?"))
                      return;
                    await commit((d) => {
                      d.reports = d.reports.filter((r) => r.id !== report.id);
                      d.report_photos = d.report_photos.filter(
                        (p) => p.report_id !== report.id,
                      );
                    });
                    setActive(undefined);
                  })
                }
              >
                Удалить черновик
              </button>
              <label className={SECONDARY_BUTTON}>
                Прикрепить фото
                <input
                  className="hidden"
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void run(() => attach(file));
                  }}
                />
              </label>
              <button
                className={PRIMARY_BUTTON}
                onClick={() =>
                  void run(() =>
                    commit((d) => {
                      const r = d.reports.find((r) => r.id === active)!;
                      const used = new Set(
                        d.reports
                          .filter(
                            (other) =>
                              other.id !== r.id &&
                              other.status === "final" &&
                              other.kind === "period",
                          )
                          .flatMap((other) => other.event_ids),
                      );
                      if (r.event_ids.some((id) => used.has(id)))
                        throw Error(
                          "Часть работ уже включена в другой документ. Создайте новый отчёт.",
                        );
                      r.status = "final";
                    }),
                  )
                }
              >
                Сформировать документ
              </button>
            </>
          )}
          <button
            className={SECONDARY_BUTTON}
            onClick={() =>
              void run(() =>
                savePDF({ ...report, photos: photos.map((p) => p.data) }),
              )
            }
          >
            PDF / Передать
          </button>
          <p>Исполнитель ____________________ Заказчик ____________________</p>
        </>
      ) : (
        <>
          <div className="rounded-xl bg-white p-4 space-y-3">
            <label>
              Смета
              <select
                className={FIELD}
                value={estimate}
                onChange={(e) => {
                  setEstimate(e.target.value);
                  setIds([]);
                }}
              >
                <option value="">Выберите смету</option>
                {data.estimates.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Тип отчёта
              <select
                className={FIELD}
                value={kind}
                onChange={(e) => setKind(e.target.value as Report["kind"])}
              >
                <option value="progress">Общий прогресс</option>
                <option value="period">За период</option>
              </select>
            </label>
            {kind === "period" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    С
                    <input
                      className={FIELD}
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </label>
                  <label>
                    По
                    <input
                      className={FIELD}
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </label>
                </div>
                <p>
                  Журнал содержит изменения, записанные этой версией приложения.
                  Старые накопительные объёмы и изменения из прежней веб-версии
                  не имеют достоверных дат. Уже включённые в сформированные
                  периодические отчёты операции исключаются. Отрицательные
                  строки отражают исправления.
                </p>
              </>
            )}
            <label className="block">
              <input
                type="checkbox"
                checked={all}
                onChange={(e) => setAll(e.target.checked)}
              />{" "}
              Вся смета
            </label>
            {!all &&
              items.map((i) => (
                <label className="block" key={i.id}>
                  <input
                    type="checkbox"
                    checked={ids.includes(i.id)}
                    onChange={(e) =>
                      setIds(
                        e.target.checked
                          ? [...ids, i.id]
                          : ids.filter((id) => id !== i.id),
                      )
                    }
                  />{" "}
                  {i.name}
                </label>
              ))}
            <button className={PRIMARY_BUTTON} onClick={() => void run(create)}>
              Создать отчёт
            </button>
          </div>
          {data.reports.map((r) => (
            <button
              className="block w-full rounded-xl bg-white p-4 text-left"
              key={r.id}
              onClick={() => setActive(r.id)}
            >
              {r.title} · {r.date} ·{" "}
              {r.status === "draft" ? "Черновик" : "Сформирован"}
            </button>
          ))}
        </>
      )}
    </section>
  );
}
