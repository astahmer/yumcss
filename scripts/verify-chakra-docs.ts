import { readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

interface ServerResult {
	readonly routeCount: number;
	readonly statuses: Readonly<Record<string, number>>;
	readonly failures: readonly { route: string; reason: string }[];
	readonly cssBytes: number;
	readonly inlineStyleBytes: number;
	readonly runtimeStyleBytes: number;
}

const [baselineUrl, cssUrl, designUrl, buildAppRoot] = process.argv.slice(2);
if (
	baselineUrl === undefined ||
	cssUrl === undefined ||
	designUrl === undefined ||
	buildAppRoot === undefined
)
	throw new Error(
		"usage: tsx scripts/verify-chakra-docs.ts BASELINE CSS_CLASS DESIGN_CSS BASELINE_NEXT_APP",
	);

async function staticRoutes(root: string): Promise<string[]> {
	const routes: string[] = [];
	const visit = async (directory: string): Promise<void> => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const absolute = resolve(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(absolute);
				continue;
			}
			if (!entry.name.endsWith(".html")) continue;
			const path = relative(root, absolute)
				.replaceAll("\\", "/")
				.replace(/\.html$/, "");
			const route = path === "index" ? "/" : `/${path.replace(/\/index$/, "")}`;
			if (route !== "/_not-found") routes.push(route);
		}
	};
	await visit(root);
	return routes.toSorted();
}

async function inspect(
	base: string,
	routes: readonly string[],
	expectedStatuses?: Readonly<Record<string, number>>,
): Promise<ServerResult> {
	const cssCache = new Map<string, number>();
	let cssBytes = 0;
	let inlineStyleBytes = 0;
	let runtimeStyleBytes = 0;
	const statuses: Record<string, number> = {};
	const failures: { route: string; reason: string }[] = [];
	for (const route of routes) {
		const response = await fetch(new URL(route, base));
		statuses[route] = response.status;
		const html = await response.text();
		const expectedStatus = expectedStatuses?.[route];
		if (expectedStatus !== undefined && response.status !== expectedStatus) {
			failures.push({
				route,
				reason: `HTTP ${response.status}; expected baseline HTTP ${expectedStatus}`,
			});
		}
		if (!response.ok) {
			if (expectedStatuses === undefined)
				failures.push({ route, reason: `HTTP ${response.status}` });
			continue;
		}
		if (html.includes("Application error") || html.includes("Unhandled Runtime Error"))
			failures.push({ route, reason: "rendered application error" });
		const stylesheetHrefs = [
			...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g),
		].map((match) => match[1]!);
		for (const href of new Set(stylesheetHrefs)) {
			if (!cssCache.has(href)) {
				const stylesheet = await fetch(new URL(href, base));
				cssCache.set(href, stylesheet.ok ? Buffer.byteLength(await stylesheet.text()) : 0);
			}
			cssBytes += cssCache.get(href)!;
		}
		for (const match of html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)) {
			const bytes = Buffer.byteLength(match[1]!);
			inlineStyleBytes += bytes;
			if (match[0]!.includes("data-pandwind-runtime")) runtimeStyleBytes += bytes;
		}
	}
	return {
		routeCount: routes.length,
		statuses,
		failures,
		cssBytes,
		inlineStyleBytes,
		runtimeStyleBytes,
	};
}

const routes = await staticRoutes(resolve(buildAppRoot));
const baselineDiscovery = await inspect(baselineUrl, routes);
const comparableRoutes = routes.filter((route) => baselineDiscovery.statuses[route] === 200);
const excludedRoutes = routes.filter((route) => baselineDiscovery.statuses[route] !== 200);
const baseline = await inspect(baselineUrl, comparableRoutes);
const [cssClass, designCss] = await Promise.all([
	inspect(cssUrl, comparableRoutes, baselineDiscovery.statuses),
	inspect(designUrl, comparableRoutes, baselineDiscovery.statuses),
]);
const comparable = (candidate: ServerResult) => ({
	cssPlusInlineStyleBytes: candidate.cssBytes + candidate.inlineStyleBytes,
	runtimeStyleBytes: candidate.runtimeStyleBytes,
});
const summarized = (candidate: ServerResult) => ({
	routeCount: candidate.routeCount,
	failures: candidate.failures,
	cssBytes: candidate.cssBytes,
	inlineStyleBytes: candidate.inlineStyleBytes,
	runtimeStyleBytes: candidate.runtimeStyleBytes,
	comparable: comparable(candidate),
});
const report = {
	discoveredRouteCount: routes.length,
	routeCount: comparableRoutes.length,
	excludedRoutes,
	baselineFailures: baselineDiscovery.failures,
	baseline: summarized(baseline),
	cssClass: summarized(cssClass),
	designCss: summarized(designCss),
	cssClassDelta:
		comparable(cssClass).cssPlusInlineStyleBytes - comparable(baseline).cssPlusInlineStyleBytes,
	designCssDelta:
		comparable(designCss).cssPlusInlineStyleBytes - comparable(baseline).cssPlusInlineStyleBytes,
};
console.log(JSON.stringify(report, null, 2));
