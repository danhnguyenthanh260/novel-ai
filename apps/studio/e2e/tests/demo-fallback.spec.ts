import { expect, test } from "@playwright/test";

test("database outage opens the interactive demo workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByTestId("demo-workspace")).toBeVisible();
  await expect(page.getByText("Interactive demo", { exact: true })).toBeVisible();
  await expect(page.getByText("Workspace unavailable")).toHaveCount(0);

  await page.getByTestId("demo-generate").click();
  await expect(page.getByTestId("demo-suggestion")).toContainText("brass key introduced in Chapter 3");

  await page.getByTestId("demo-tab-outline").click();
  await expect(page.getByRole("heading", { name: "Chapter 12 narrative arc" })).toBeVisible();
  await page.getByTestId("demo-tab-publish").click();
  await expect(page.getByRole("heading", { name: "Ready for early readers" })).toBeVisible();
  await page.getByTestId("demo-tab-signals").click();
  await expect(page.getByRole("heading", { name: "Listen without losing your voice" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("demo-tab-draft").click();
  await expect(page.getByTestId("demo-generate")).toBeVisible();
});
