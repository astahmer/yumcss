import { expect } from "@playwright/test";
import { createBdd, test } from "playwright-bdd";

const { Given, When, Then } = createBdd(test);

Given("I open the playground migration lab", async ({ page }) => {
	await page.goto("/migrate", { waitUntil: "domcontentloaded" });
	await expect(page.locator("main h1")).toHaveText("Migration lab", {
		timeout: 15_000,
	});
});

Given("I open the playground route {string}", async ({ page }, route: string) => {
	await page.goto(route);
});

When("I choose {string} from {string}", async ({ page }, option: string, label: string) => {
	await page.getByRole("combobox", { name: label }).selectOption({ label: option });
});

When(
	"I choose {string} from preview control {string}",
	async ({ page }, option: string, controlId: string) => {
		await page.locator(`[data-preview-control="${controlId}"]`).selectOption(option);
	},
);

When("I click the {string} button", async ({ page }, name: string) => {
	await page.getByRole("button", { name, exact: true }).click();
});

Then("the page heading is {string}", async ({ page }, name: string) => {
	await expect(page.locator("h1").filter({ hasText: name })).toBeVisible();
});

Then("the editor has no TypeScript error markers", async ({ page }) => {
	await expect(page.locator(".monaco-editor")).toBeVisible();
	await page.waitForTimeout(1000);
	await expect(page.locator(".monaco-editor .squiggly-error")).toHaveCount(0);
});

Then("the editor has syntax highlighting", async ({ page }) => {
	await expect(
		page.locator('.monaco-editor .view-line span[class^="mtk"]:not(.mtk1)').first(),
	).toBeVisible();
});

When("I expand the {string} inspector panel", async ({ page }, label: string) => {
	const pane = page.locator(`[data-pane="${label}"]`);
	await expect
		.poll(() => pane.evaluate((element) => element.getBoundingClientRect().height))
		.toBeLessThan(70);
	await pane.getByRole("button", { name: label, exact: true }).click();
});

When("I collapse the {string} inspector panel", async ({ page }, label: string) => {
	const pane = page.locator(`[data-pane="${label}"]`);
	await pane.getByRole("button", { name: label, exact: true }).click();
});

Then("the {string} inspector panel has room for content", async ({ page }, label: string) => {
	const pane = page.locator(`[data-pane="${label}"]`);
	const content = pane.locator(":scope > div").last();
	await expect(content).toBeVisible();
	await expect
		.poll(() => content.evaluate((element) => element.getBoundingClientRect().height))
		.toBeGreaterThan(80);
});

Then("the {string} inspector panel is collapsed", async ({ page }, label: string) => {
	const pane = page.locator(`[data-pane="${label}"]`);
	await expect(pane.getByRole("button", { name: label, exact: true })).toHaveAttribute(
		"aria-expanded",
		"false",
	);
	await expect(pane.locator(":scope > div").last()).toBeHidden();
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

Then("the component-token preview uses background {string}", async ({ page }, color: string) => {
	const preview = page.locator('[data-preview-kind="card"] > article');
	await expect(preview).toHaveCSS("background-color", color);
	await expect(page.locator("body")).toContainText(`card uses component.state.emptyBg (${color})`);
});

Then(
	"the variant preview button uses background {string} and padding {string}",
	async ({ page }, background: string, padding: string) => {
		const preview = page.locator('[data-preview-kind="button"] > button');
		await expect(preview).toHaveCSS("background-color", background);
		await expect(preview).toHaveCSS("padding", padding);
	},
);
