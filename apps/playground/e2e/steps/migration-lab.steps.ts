import { expect } from "@playwright/test";
import { createBdd, test } from "playwright-bdd";

const { Given, When, Then } = createBdd(test);

Given("I open the playground migration lab", async ({ page }) => {
	await page.goto("/migrate");
	await expect(page.getByRole("heading", { name: "Migration lab" })).toBeVisible();
});

When("I choose {string} from {string}", async ({ page }, option: string, label: string) => {
	await page.getByRole("combobox", { name: label }).selectOption({ label: option });
});

When("I click the {string} button", async ({ page }, name: string) => {
	await page.getByRole("button", { name, exact: true }).click();
});

Then("the page heading is {string}", async ({ page }, name: string) => {
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
});

Then("the {string} selector has value {string}", async ({ page }, label: string, value: string) => {
	await expect(page.getByRole("combobox", { name: label })).toHaveValue(value);
});

Then("the output pane for {string} is visible", async ({ page }, target: string) => {
	const pane = page.locator("section").filter({
		has: page.getByRole("heading", { name: `Output · ${target}`, exact: true }),
	});
	await expect(pane).toBeVisible();
});

Then(
	"the output pane for {string} contains {string}",
	async ({ page }, target: string, text: string) => {
		const pane = page.locator("section").filter({
			has: page.getByRole("heading", { name: `Output · ${target}`, exact: true }),
		});
		await expect(pane).toContainText(text);
	},
);

Then("the {string} panel is visible", async ({ page }, name: string) => {
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
});

Then(
	"the migration summary reports {string} for {string}",
	async ({ page }, value: string, label: string) => {
		const summary = page
			.locator("div")
			.filter({ hasText: new RegExp(`^${label}\\s*${value}$`, "u") });
		await expect(summary).toBeVisible();
	},
);

Then("the code editor contains {string}", async ({ page }, text: string) => {
	await expect(page.locator(".monaco-editor").first()).toContainText(text);
});

Then("the page contains the text {string}", async ({ page }, text: string) => {
	await expect(page.getByText(text, { exact: true })).toBeVisible();
});
