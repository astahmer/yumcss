import type {
	MigrationPreviewHostPort,
	MigrationPreviewRequest,
	MigrationPreviewSnapshot,
} from "./contracts.ts";

export const MigrationPreviewHostId = {
	Browser: "browser",
} as const;

export interface MigrationPreviewBrowserPage {
	goto(url: string): Promise<void>;
	evaluate<TOutput>(operation: string): Promise<TOutput>;
	close?(): Promise<void>;
}

export interface MigrationPreviewBrowser {
	newPage(): Promise<MigrationPreviewBrowserPage>;
	close(): Promise<void>;
}

export interface BrowserMigrationPreviewOptions {
	readonly url: string;
	readonly browser: MigrationPreviewBrowser;
	readonly probeClass?: string;
}

interface BrowserPreviewResult {
	readonly computedStyles: Readonly<Record<string, string>>;
	readonly stylesheetBytes: number;
}

const applyEvaluation = async (
	page: MigrationPreviewBrowserPage,
	request: MigrationPreviewRequest,
	probeClass: string,
): Promise<BrowserPreviewResult> => {
	const css = request.evaluation.artifacts?.targetCss ?? "";
	return page.evaluate(
		`(() => {
			const { css: nextCss, probe } = ${JSON.stringify({ css, probe: probeClass })};
			let style = document.querySelector("style[data-pandwind-migration-preview]");
			if (!(style instanceof HTMLStyleElement)) {
				style = document.createElement("style");
				style.dataset.pandwindMigrationPreview = "";
				document.head.append(style);
			}
			style.textContent = nextCss;
			let element = document.querySelector("[data-pandwind-migration-preview-probe]");
			if (!(element instanceof HTMLElement)) {
				element = document.createElement("div");
				element.dataset.pandwindMigrationPreviewProbe = "";
			element.textContent = "Pandwind migration preview";
				document.body.append(element);
			}
			element.className = probe;
			const computed = getComputedStyle(element);
			const computedStyles = Object.fromEntries(
				Array.from(computed)
					.map((property) => [property, computed.getPropertyValue(property)])
					.filter(([, value]) => value.length > 0),
			);
			return { computedStyles, stylesheetBytes: nextCss.length };
		})()`,
	);
};

/**
 * Browser host boundary for the local migration preview. The browser implementation is
 * injected so the analyze package stays independent of Playwright or a
 * framework runtime. A host owns the page URL; migration preview only injects the
 * evaluated target CSS and records computed-style evidence.
 */
export const createBrowserMigrationPreviewHost = (
	options: BrowserMigrationPreviewOptions,
): MigrationPreviewHostPort => {
	let page: MigrationPreviewBrowserPage | undefined;
	const probeClass = options.probeClass ?? "pandwind-migration-preview-probe";
	const render = async (
		request: MigrationPreviewRequest,
		status: "starting" | "ready",
	): Promise<MigrationPreviewSnapshot> => {
		if (page === undefined) page = await options.browser.newPage();
		await page.goto(options.url);
		const result = await applyEvaluation(page, request, probeClass);
		return {
			host: MigrationPreviewHostId.Browser,
			status,
			url: options.url,
			computedStyles: result.computedStyles,
			stylesheetBytes: result.stylesheetBytes,
		};
	};

	return {
		id: MigrationPreviewHostId.Browser,
		available: true,
		start: (request) => render(request, "ready"),
		update: (request) => render(request, "ready"),
		stop: async () => {
			await page?.close?.();
			await options.browser.close();
			page = undefined;
		},
	};
};
