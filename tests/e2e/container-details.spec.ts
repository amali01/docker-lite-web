import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("opens container details and switches across key tabs", async ({ page }) => {
  await signIn(page);
  await page.goto("/containers");

  await expect(page.getByRole("heading", { name: "Containers" })).toBeVisible();

  await page.getByRole("link", { name: "View details for nginx-proxy" }).click();

  await expect(page).toHaveURL(/\/containers\/a1b2c3d4e5f6$/);
  await expect(page.getByRole("heading", { name: "nginx-proxy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to containers" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Standalone container")).toBeVisible();

  await page.getByRole("tab", { name: "Inspect" }).click();
  await expect(page.getByText("Inspect JSON")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy JSON" })).toBeVisible();
  await expect(page.getByText('"Image": "nginx:alpine"')).toBeVisible();

  await page.getByRole("tab", { name: "Stats" }).click();
  await expect(page.getByText("Latest sample")).toBeVisible();
  await expect(page.getByText("Sample history")).toBeVisible();

  await page.getByRole("tab", { name: "Logs" }).click();
  await expect(page.getByTestId("container-logs")).toBeVisible();
});
