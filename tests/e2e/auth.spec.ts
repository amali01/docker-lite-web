import { expect, test } from "@playwright/test";

test("signs in with the seeded default admin password", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByText("Default credentials are active.")).toBeVisible();

  await page.getByLabel("Admin user").fill("admin");
  await page.getByLabel("Admin password").fill("admin");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
