import { expect, test } from "@playwright/test";

test("tests backend connectivity from settings", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await page.getByRole("button", { name: "Test Connection" }).click();

  await expect(page.getByText("Connection succeeded")).toBeVisible();
});

test("creates and removes a volume", async ({ page }) => {
  const volumeName = `playwright-volume-${Date.now()}`;

  await page.goto("/volumes");

  await expect(page.getByRole("heading", { name: "Volumes" })).toBeVisible();

  await page.getByRole("button", { name: "Create Volume" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("e.g. postgres-data").fill(volumeName);
  await dialog.getByRole("button", { name: "Create Volume" }).click();

  await expect(page.getByText(`Created ${volumeName}`)).toBeVisible();

  const volumeRow = page.locator("tr", { hasText: volumeName });
  await expect(volumeRow).toBeVisible();

  await volumeRow.locator("button").last().click();

  await expect(page.getByText(`Removed ${volumeName}`)).toBeVisible();
  await expect(volumeRow).toHaveCount(0);
});
