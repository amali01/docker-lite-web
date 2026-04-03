import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

test("loads dashboard and performs a safe container mutation", async ({ page }) => {
  await signIn(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("link", { name: "Containers" }).click();

  await expect(page.getByText("postgres-db")).toBeVisible();

  const postgresRow = page.locator("tr", { hasText: "postgres-db" });
  await postgresRow.getByTitle("Start").click();

  await expect(page.getByText("Started postgres-db")).toBeVisible();
});
