import { expect } from "@playwright/test";
import { createBdd, test } from "playwright-bdd";

const { Given, When, Then } = createBdd(test);

Given("I open the local Studio", async ({ page }) => {
	await page.goto("/?token=studio-test", { waitUntil: "domcontentloaded" });
	await expect(page.locator("h1")).toHaveText("pandwind / studio");
	await expect(page.locator("#file option")).toHaveCount(1);
});

Then("the source adapter {string} is available", async ({ page }, adapter: string) => {
	await expect(page.locator("#source option", { hasText: adapter })).toHaveCount(1);
});

When(
	"I choose {string} from the {string} selector",
	async ({ page }, value: string, label: string) => {
		await page.getByLabel(label).selectOption({ label: value });
	},
);

When("I click the {string} button", async ({ page }, label: string) => {
	await page.getByRole("button", { name: label, exact: true }).click();
});

When("I replace the Studio editor with:", async ({ page }, source: string) => {
	await page.locator("#editor").fill(source);
});

Then("the Studio output contains {string}", async ({ page }, value: string) => {
	await expect(page.locator("#output")).toContainText(value);
});
