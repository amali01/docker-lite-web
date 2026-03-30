import { test, expect } from "@playwright/test";

test("loads dashboard and performs a safe container mutation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText(/Docker Engine v25.0.3/)).toBeVisible();

  await page.getByRole("link", { name: "Containers" }).click();

  await expect(page.getByText("postgres-db")).toBeVisible();

  const postgresRow = page.locator("tr", { hasText: "postgres-db" });
  await postgresRow.getByTitle("Start").click();

  await expect(page.getByText("Started postgres-db")).toBeVisible();
});
