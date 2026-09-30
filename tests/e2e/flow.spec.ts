import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, name = "Sofie Andersen") {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.waitForURL("**/app");
}

test("forside og demo-login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Fakturaer betalt/ })).toBeVisible();
  await page.getByRole("button", { name: /Prøv demoen nu/ }).click();
  await page.waitForURL("**/app");
  await expect(page.getByText("Det skal du tage dig af i dag")).toBeVisible();
});

test("svindelforsøg stoppes og kræver bekræftelse", async ({ page }) => {
  await loginAs(page);
  await page.goto("/app/inbox?tab=review&q=Hansen");
  await page.getByRole("link", { name: /Hansen & Søn VVS/ }).first().click();
  await expect(page.getByText(/skiftet betalingsoplysninger/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send til godkendelse" })).toBeVisible();
  await page.getByRole("button", { name: "Send til godkendelse" }).click();
  await expect(page.getByText(/kritiske advarsler/)).toBeVisible();
  await page.getByRole("button", { name: /bekræftet det nye kontonummer/ }).click();
  await expect(page.getByText(/kontrolleret og godkendt/)).toBeVisible();
});

test("upload af eksempelfaktura aflæses og konteres", async ({ page }) => {
  await loginAs(page);
  await page.goto("/app/inbox");
  await page.getByRole("button", { name: "Kendt leverandør" }).click();
  await page.waitForURL("**/app/invoices/**");
  await expect(page.getByText("Fakturadata")).toBeVisible();
  await expect(page.getByText(/sikker/).first()).toBeVisible();
});

test("godkend, betal med MitID (sandbox) og se batch", async ({ page }) => {
  await loginAs(page);
  await page.goto("/app/approvals");
  await page.getByRole("button", { name: "Godkend", exact: true }).first().click();
  await expect(page.getByText(/Godkendt – betaling planlagt|helt ajour/).first()).toBeVisible();

  await page.goto("/app/payments");
  await page.getByRole("button", { name: /Send til banken/ }).click();
  await page.waitForURL("**/app/payments/batches/**");
  await page.getByRole("button", { name: /Underskriv med MitID/ }).click();
  await page.waitForURL("**/bank/sandbox-sca**");
  await page.getByPlaceholder("fx demo").fill("demo");
  await page.getByRole("button", { name: "Fortsæt" }).click();
  await page.getByRole("link", { name: "Godkend betalinger" }).click();
  await page.waitForURL("**/app/payments/batches/**signed=1");
  await expect(page.getByText(/underskrevet og sendt til banken/)).toBeVisible();
});

test("AI-assistenten svarer på spørgsmål", async ({ page }) => {
  await loginAs(page);
  // Genvejen virker først, når siden er hydreret – tryk igen, indtil paletten åbner.
  const input = page.getByPlaceholder(/Spørg om fakturaer/);
  await expect(async () => {
    if (!(await input.isVisible())) await page.keyboard.press("Control+k");
    await expect(input).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20000 });
  await input.fill("Hvad forfalder i denne uge?");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/forfalder|Der forfalder ingen/).first()).toBeVisible();
});

test("forbind ny bank via sandbox-samtykke", async ({ page }) => {
  await loginAs(page);
  await page.goto("/app/bank");
  await page.getByRole("button", { name: "Forbind bank" }).click();
  await page.getByRole("button", { name: "Nordea" }).click();
  await page.waitForURL("**/bank/sandbox-consent**");
  await page.getByPlaceholder("fx demo").fill("demo");
  await page.getByRole("button", { name: "Fortsæt" }).click();
  await page.getByRole("link", { name: "Giv samtykke" }).click();
  await page.waitForURL("**/app/bank?connected=1");
  await expect(page.getByText("Nordea").first()).toBeVisible();
});

test("medarbejder indsender udlæg", async ({ page }) => {
  await loginAs(page, "Jonas Nielsen");
  await page.goto("/app/expenses");
  await expect(page.getByText("Nyt udlæg")).toBeVisible();
  await expect(page.getByRole("link", { name: /Byggemarked Nord A\/S/ }).first()).toBeVisible();
});

test("mobilvisning af godkendelser", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  await loginAs(page, "Anna Larsen");
  await page.goto("/app/approvals");
  await expect(page.getByRole("heading", { name: "Godkendelser" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Godkend/ }).first()).toBeVisible();
  await ctx.close();
});
