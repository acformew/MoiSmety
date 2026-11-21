import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const uid = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
it("applies compatible migration, enforces RLS, atomic CAS, and stable operation receipts", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${uid}'),('${other}'); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`,
    );
    await pg.exec(
      readFileSync("supabase/setup.sql", "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
    await pg.exec(
      readFileSync(
        "supabase/migrations/202611210001_offline_reports.sql",
        "utf8",
      ),
    );
    await pg.exec(
      `set role authenticated; set request.jwt.claim.sub='${uid}';`,
    );
    const work = {
      id,
      user_id: uid,
      name: "Тест",
      unit: "м²",
      price: 20,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const changes = [{ table: "work_items", id, before: null, after: work }];
    const result = await pg.query(
      "select public.moismety_sync($1,$2) as snapshot",
      ["44444444-4444-4444-8444-444444444444", JSON.stringify(changes)],
    );
    const retry = await pg.query(
      "select public.moismety_sync($1,$2) as snapshot",
      ["44444444-4444-4444-8444-444444444444", JSON.stringify(changes)],
    );
    expect(retry.rows).toEqual(result.rows);
    expect(
      (result.rows[0] as { snapshot: { work_items: unknown[] } }).snapshot
        .work_items,
    ).toHaveLength(1);
    await expect(
      pg.query("select public.moismety_sync($1,$2)", [
        "55555555-5555-4555-8555-555555555555",
        JSON.stringify([
          { ...changes[0], before: work, after: { ...work, price: 40 } },
        ]),
      ]),
    ).rejects.toThrow("Конфликт");
    // Two devices start from the same server row. Only one update may win.
    const first = (
      result.rows[0] as { snapshot: { work_items: Record<string, unknown>[] } }
    ).snapshot.work_items[0];
    await pg.query("select public.moismety_sync($1,$2)", [
      "77777777-7777-4777-8777-777777777777",
      JSON.stringify([
        {
          table: "work_items",
          id,
          before: first,
          after: { ...first, price: 30 },
        },
      ]),
    ]);
    await expect(
      pg.query("select public.moismety_sync($1,$2)", [
        "88888888-8888-4888-8888-888888888888",
        JSON.stringify([
          {
            table: "work_items",
            id,
            before: first,
            after: { ...first, price: 99 },
          },
        ]),
      ]),
    ).rejects.toThrow("Конфликт");
    expect(
      (await pg.query<{ price: string }>("select price from public.work_items"))
        .rows[0].price,
    ).toBe("30.00");
    const estimate = "99999999-9999-4999-8999-999999999999";
    const item = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await pg.exec(
      `insert into public.estimates(id,user_id) values('${estimate}','${uid}'); insert into public.estimate_items(id,user_id,estimate_id,name,unit_price,completed_qty) values('${item}','${uid}','${estimate}','Работа',20,50); update public.estimate_items set completed_qty=55 where id='${item}';`,
    );
    expect(
      (
        await pg.query<{ delta: string }>(
          "select delta from public.completions",
        )
      ).rows[0].delta,
    ).toBe("5.000");
    const eid = (
      await pg.query<{ id: string }>("select id from public.completions")
    ).rows[0].id;
    const report = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const report2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const insertReport = `insert into public.reports(id,user_id,estimate_id,title,customer,date,"from","to",kind,status,note,lines,event_ids,photos,created_at) values($1,$2,$3,'Снимок','Заказчик',current_date,current_date::text,current_date::text,'period','final','','[]',$4,'[]',now())`;
    await pg.query(insertReport, [
      report,
      uid,
      estimate,
      JSON.stringify([eid]),
    ]);
    await expect(
      pg.query(insertReport, [report2, uid, estimate, JSON.stringify([eid])]),
    ).rejects.toThrow("уже включена");
    await expect(
      pg.query("update public.reports set title=$1 where id=$2", [
        "Изменён",
        report,
      ]),
    ).rejects.toThrow("неизменяем");
    await pg.exec(`set request.jwt.claim.sub='${other}';`);
    expect(
      (await pg.query("select * from public.work_items")).rows,
    ).toHaveLength(0);
    await expect(
      pg.query("select public.moismety_sync($1,$2)", [
        "66666666-6666-4666-8666-666666666666",
        JSON.stringify(changes),
      ]),
    ).rejects.toThrow("владелец");
  } finally {
    await pg.close();
  }
}, 30000);
