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

export const TOKEN_USAGE_ACTIVITIES = ["hot", "used", "not-observed"] as const;
export type TokenUsageActivity = (typeof TOKEN_USAGE_ACTIVITIES)[number];

export const TOKEN_CONDITION_KINDS = ["responsive", "pseudo", "media", "other"] as const;
export type TokenConditionKind = (typeof TOKEN_CONDITION_KINDS)[number];

export const CLEANUP_SAFETIES = ["safe-to-remove", "review-required", "not-removable"] as const;
export type CleanupSafetyFilter = (typeof CLEANUP_SAFETIES)[number];

export interface InspectorBuildFilters {
	fold: BuildFileFilter | null;
	missingCss: BuildMissingCssFilter | null;
	authoredValue: BuildAuthoredValueFilter | null;
}

export interface InspectorUrlState {
	tab: InspectorTab;
	query: string;
	section: string | null;
	anchor?: string;
	buildFilters?: InspectorBuildFilters;
	tokenActivity?: TokenUsageActivity;
	tokenCategory?: string;
	tokenSearch?: string;
	conditionKind?: TokenConditionKind;
	cleanupSafety?: CleanupSafetyFilter;
	relationshipNode?: string;
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
const tokenUsageActivities: ReadonlySet<string> = new Set(TOKEN_USAGE_ACTIVITIES);
const tokenConditionKinds: ReadonlySet<string> = new Set(TOKEN_CONDITION_KINDS);
const cleanupSafeties: ReadonlySet<string> = new Set(CLEANUP_SAFETIES);

const isTab = (value: string): value is InspectorTab => inspectorTabs.has(value);
const isBuildFileFilter = (value: string | null): value is BuildFileFilter =>
	value !== null && buildFileFilters.has(value);
const isBuildMissingCssFilter = (value: string | null): value is BuildMissingCssFilter =>
	value !== null && buildMissingCssFilters.has(value);
const isBuildAuthoredValueFilter = (value: string | null): value is BuildAuthoredValueFilter =>
	value !== null && buildAuthoredValueFilters.has(value);
const isTokenUsageActivity = (value: string | null): value is TokenUsageActivity =>
	value !== null && tokenUsageActivities.has(value);
const isTokenConditionKind = (value: string | null): value is TokenConditionKind =>
	value !== null && tokenConditionKinds.has(value);
const isCleanupSafetyFilter = (value: string | null): value is CleanupSafetyFilter =>
	value !== null && cleanupSafeties.has(value);

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
	const anchor = params.get("anchor");
	const fold = params.get("fold");
	const missingCss = params.get("missingCss");
	const authoredValue = params.get("authoredValue");
	const tokenActivity = params.get("tokenActivity");
	const tokenCategory = params.get("tokenCategory");
	const tokenSearch = params.get("tokenSearch");
	const conditionKind = params.get("conditionKind");
	const cleanupSafety = params.get("cleanupSafety");
	const relationshipNode = params.get("relationshipNode");
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
		...(anchor === null || anchor === "" ? {} : { anchor }),
		...(Object.values(buildFilters).some((value) => value !== null) ? { buildFilters } : {}),
		...(isTokenUsageActivity(tokenActivity) ? { tokenActivity } : {}),
		...(tokenCategory === null || tokenCategory === "" ? {} : { tokenCategory }),
		...(tokenSearch === null || tokenSearch === "" ? {} : { tokenSearch }),
		...(isTokenConditionKind(conditionKind) ? { conditionKind } : {}),
		...(isCleanupSafetyFilter(cleanupSafety) ? { cleanupSafety } : {}),
		...(relationshipNode === null || relationshipNode === "" ? {} : { relationshipNode }),
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
	for (const [key, value] of [
		["tokenActivity", state.tokenActivity],
		["tokenCategory", state.tokenCategory],
		["tokenSearch", state.tokenSearch],
		["conditionKind", state.conditionKind],
		["cleanupSafety", state.cleanupSafety],
		["relationshipNode", state.relationshipNode],
		["anchor", state.anchor],
	] as const) {
		if (value === undefined || value === "") params.delete(key);
		else params.set(key, value);
	}
	params.delete("tab");
	const search = params.toString();
	const section = state.section === null ? "" : `/${encodeURIComponent(state.section)}`;
	return `${search === "" ? "" : `?${search}`}#${state.tab}${section}`;
}
