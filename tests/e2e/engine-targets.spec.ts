import { expect, test } from "@playwright/test";

test("manages engine targets from settings", async ({ page }) => {
  const targetName = `Playwright SSH ${Date.now()}`;
  const notifications = page.getByLabel("Notifications alt+T");

  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Engine Targets" })).toBeVisible();

  await page.getByRole("textbox", { name: /^Label$/ }).fill(targetName);
  await page.getByRole("textbox", { name: /^Host$/ }).fill("playwright.example.internal");
  await page.getByRole("textbox", { name: /^Username$/ }).fill("ops");

  await page.getByRole("button", { name: "Test Target" }).click();
  await expect(notifications.getByText("Mock ssh connection successful")).toBeVisible();

  await page.getByRole("button", { name: "Add Engine Target" }).click();
  await expect(notifications.getByText(`Added ${targetName}`)).toBeVisible();

  const targetCard = page.getByRole("group", { name: `Engine target ${targetName}` });
  await expect(targetCard).toBeVisible();

  await targetCard.getByRole("button", { name: "Re-test" }).click();
  await expect(targetCard.getByText("Mock ssh connection successful")).toBeVisible();

  await targetCard.getByRole("button", { name: "Use" }).click();
  await expect(notifications.getByText("Switched to ssh://ops@playwright.example.internal")).toBeVisible();

  await page.getByRole("textbox", { name: /^Label$/ }).fill("Temporary Draft");
  await page.getByRole("textbox", { name: /^Host$/ }).fill("draft.example.internal");
  await page.getByRole("textbox", { name: /^Username$/ }).fill("draft-user");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByRole("textbox", { name: /^Label$/ })).toHaveValue("");

  await targetCard.getByRole("button", { name: "Delete" }).click();
  await expect(notifications.getByText(`Removed ${targetName}`)).toBeVisible();
  await expect(page.getByRole("group", { name: `Engine target ${targetName}` })).toHaveCount(0);
});
