import type {
	StudioPreviewHostPort,
	StudioPreviewRequest,
	StudioPreviewSnapshot,
} from "./contracts.ts";

export const StudioPreviewHostId = {
	Browser: "browser",
} as const;

export interface StudioPreviewBrowserPage {
	goto(url: string): Promise<void>;
	evaluate<TOutput>(operation: string): Promise<TOutput>;
	close?(): Promise<void>;
}

export interface StudioPreviewBrowser {
	newPage(): Promise<StudioPreviewBrowserPage>;
	close(): Promise<void>;
}

export interface BrowserStudioPreviewOptions {
	readonly url: string;
	readonly browser: StudioPreviewBrowser;
	readonly probeClass?: string;
}

interface BrowserPreviewResult {
	readonly computedStyles: Readonly<Record<string, string>>;
	readonly stylesheetBytes: number;
}

const applyEvaluation = async (
	page: StudioPreviewBrowserPage,
	request: StudioPreviewRequest,
	probeClass: string,
): Promise<BrowserPreviewResult> => {
	const css = request.evaluation.artifacts?.targetCss ?? "";
	return page.evaluate(
		`(() => {
			const { css: nextCss, probe } = ${JSON.stringify({ css, probe: probeClass })};
			let style = document.querySelector("style[data-pandwind-studio]");
			if (!(style instanceof HTMLStyleElement)) {
				style = document.createElement("style");
				style.dataset.pandwindStudio = "";
				document.head.append(style);
			}
			style.textContent = nextCss;
			let element = document.querySelector("[data-pandwind-studio-probe]");
			if (!(element instanceof HTMLElement)) {
				element = document.createElement("div");
				element.dataset.pandwindStudioProbe = "";
				element.textContent = "Pandwind Studio preview";
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
 * Browser host boundary for the local Studio. The browser implementation is
 * injected so the analyze package stays independent of Playwright or a
 * framework runtime. A host owns the page URL; Studio only injects the
 * evaluated target CSS and records computed-style evidence.
 */
export const createBrowserStudioPreviewHost = (
	options: BrowserStudioPreviewOptions,
): StudioPreviewHostPort => {
	let page: StudioPreviewBrowserPage | undefined;
	const probeClass = options.probeClass ?? "pandwind-studio-probe";
	const render = async (
		request: StudioPreviewRequest,
		status: "starting" | "ready",
	): Promise<StudioPreviewSnapshot> => {
		if (page === undefined) page = await options.browser.newPage();
		await page.goto(options.url);
		const result = await applyEvaluation(page, request, probeClass);
		return {
			host: StudioPreviewHostId.Browser,
			status,
			url: options.url,
			computedStyles: result.computedStyles,
			stylesheetBytes: result.stylesheetBytes,
		};
	};

	return {
		id: StudioPreviewHostId.Browser,
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
