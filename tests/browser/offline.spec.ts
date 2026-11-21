import { test, expect } from "@playwright/test";
test("offline estimates, persistent restart, account isolation, snapshot reports and PDF", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    localStorage.setItem("moismety-url", "https://test.supabase.co");
    localStorage.setItem(
      "moismety-key",
      "sb_publishable_public_test_key_123456",
    );
    if (!localStorage.getItem("moismety-test-initialized")) {
      localStorage.setItem("moismety-test-initialized", "yes");
      localStorage.setItem(
        "moismety-last-user",
        JSON.stringify({
          id: "11111111-1111-4111-8111-111111111111",
          email: "offline@example.test",
        }),
      );
    }
  });
  await context.route("https://test.supabase.co/**", (route) => route.abort());
  await page.goto("http://127.0.0.1:5173");
  await page.getByRole("button", { name: "Загрузить пример" }).click();
  await expect(
    page.getByText("Сохранено на устройстве", { exact: false }),
  ).toBeVisible();
  await page.getByRole("checkbox").nth(1).check();
  await page
    .getByRole("button", { name: /Составить смету из выбранных/ })
    .click();
  await page.getByLabel("План работы 1", { exact: true }).fill("100");
  await page.getByLabel("Выполнено работы 1", { exact: true }).fill("5");
  await page.getByLabel("Выполнено работы 1", { exact: true }).blur();
  await expect(
    page.getByText("Сохранено на устройстве", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Мои сметы", exact: true }).click();
  await page.getByRole("button", { name: "Открыть", exact: true }).click();
  await expect(
    page.getByLabel("Выполнено работы 1", { exact: true }),
  ).toHaveValue("5");
  await page.getByRole("button", { name: "Отчёты", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Смета", exact: true })
    .selectOption({ index: 1 });
  await page
    .getByRole("button", { name: "Создать отчёт", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Сформировать документ", exact: true })
    .click();
  await expect(
    page.getByText("Сформированный документ", { exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "PDF / Передать", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const path = await download.path();
  const fs = await import("node:fs/promises");
  expect((await fs.readFile(path!)).subarray(0, 5).toString()).toBe("%PDF-");
  await page.evaluate(() =>
    localStorage.setItem(
      "moismety-last-user",
      JSON.stringify({
        id: "22222222-2222-4222-8222-222222222222",
        email: "other@example.test",
      }),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: "Мои сметы", exact: true }).click();
  await expect(
    page.getByText("Пока нет ни одной сметы", { exact: true }),
  ).toBeVisible();
});
