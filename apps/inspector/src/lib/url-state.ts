export const INSPECTOR_TABS = ["tokens", "build", "history"] as const;

export type InspectorTab = (typeof INSPECTOR_TABS)[number];

export const BUILD_FILE_FILTERS = [
	"full",
	"partial",
	"runtime",
	"no-calls",
	"eliminated",
	"has-full",
	"has-partial",
] as const;
export type BuildFileFilter = (typeof BUILD_FILE_FILTERS)[number];

export const BUILD_MISSING_CSS_FILTERS = ["present", "none"] as const;
export type BuildMissingCssFilter = (typeof BUILD_MISSING_CSS_FILTERS)[number];

export const BUILD_AUTHORED_VALUE_FILTERS = ["token", "literal", "dynamic"] as const;
export type BuildAuthoredValueFilter = (typeof BUILD_AUTHORED_VALUE_FILTERS)[number];

export interface InspectorBuildFilters {
	fold: BuildFileFilter | null;
	missingCss: BuildMissingCssFilter | null;
	authoredValue: BuildAuthoredValueFilter | null;
}

export interface InspectorUrlState {
	tab: InspectorTab;
	query: string;
	section: string | null;
	buildFilters?: InspectorBuildFilters;
}

const DEFAULT_STATE: InspectorUrlState = {
	tab: "tokens",
	query: "",
	section: null,
};

const inspectorTabs: ReadonlySet<string> = new Set(INSPECTOR_TABS);
const buildFileFilters: ReadonlySet<string> = new Set(BUILD_FILE_FILTERS);
const buildMissingCssFilters: ReadonlySet<string> = new Set(BUILD_MISSING_CSS_FILTERS);
const buildAuthoredValueFilters: ReadonlySet<string> = new Set(BUILD_AUTHORED_VALUE_FILTERS);

const isTab = (value: string): value is InspectorTab => inspectorTabs.has(value);
const isBuildFileFilter = (value: string | null): value is BuildFileFilter =>
	value !== null && buildFileFilters.has(value);
const isBuildMissingCssFilter = (value: string | null): value is BuildMissingCssFilter =>
	value !== null && buildMissingCssFilters.has(value);
const isBuildAuthoredValueFilter = (value: string | null): value is BuildAuthoredValueFilter =>
	value !== null && buildAuthoredValueFilters.has(value);

const decode = (value: string): string => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

export function readInspectorUrlState(input: { hash: string; search: string }): InspectorUrlState {
	const params = new URLSearchParams(input.search);
	const query = params.get("q") ?? "";
	const fold = params.get("fold");
	const missingCss = params.get("missingCss");
	const authoredValue = params.get("authoredValue");
	const buildFilters: InspectorBuildFilters = {
		fold: isBuildFileFilter(fold) ? fold : null,
		missingCss: isBuildMissingCssFilter(missingCss) ? missingCss : null,
		authoredValue: isBuildAuthoredValueFilter(authoredValue) ? authoredValue : null,
	};
	let tab = DEFAULT_STATE.tab;
	let section: string | null = null;
	const hash = input.hash.replace(/^#/, "");
	if (hash !== "") {
		const [hashTab, hashSection] = hash.split("/", 2).map(decode);
		const candidateTab = hashTab ?? "";
		if (isTab(candidateTab)) {
			tab = candidateTab;
			section = hashSection === undefined ? null : hashSection;
		}
	}
	return {
		tab,
		query,
		section,
		...(Object.values(buildFilters).some((value) => value !== null) ? { buildFilters } : {}),
	};
}

export function serializeInspectorUrlState(state: InspectorUrlState, existingSearch = ""): string {
	const params = new URLSearchParams(existingSearch);
	if (state.query === "") params.delete("q");
	else params.set("q", state.query);
	for (const key of ["fold", "missingCss", "authoredValue"] as const) {
		const value = state.buildFilters?.[key];
		if (value === undefined || value === null) params.delete(key);
		else params.set(key, value);
	}
	params.delete("tab");
	const search = params.toString();
	const section = state.section === null ? "" : `/${encodeURIComponent(state.section)}`;
	return `${search === "" ? "" : `?${search}`}#${state.tab}${section}`;
}
