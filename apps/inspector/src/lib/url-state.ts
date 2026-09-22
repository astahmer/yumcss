export const INSPECTOR_TABS = [
	"design",
	"graph",
	"stats",
	"usage",
	"governance",
	"history",
] as const;

export type InspectorTab = (typeof INSPECTOR_TABS)[number];

export interface InspectorUrlState {
	tab: InspectorTab;
	query: string;
	section: string | null;
}

const DEFAULT_STATE: InspectorUrlState = {
	tab: "design",
	query: "",
	section: null,
};

const isTab = (value: string): value is InspectorTab =>
	(INSPECTOR_TABS as ReadonlyArray<string>).includes(value);

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
	const queryTab = params.get("tab");
	const candidateQueryTab = queryTab ?? "";
	let tab = isTab(candidateQueryTab) ? candidateQueryTab : DEFAULT_STATE.tab;
	let section: string | null = null;
	const hash = input.hash.replace(/^#/, "");
	if (hash !== "") {
		const [hashTab, hashSection] = hash.split("/", 2).map(decode);
		const candidateTab = hashTab ?? "";
		if (isTab(candidateTab)) {
			tab = candidateTab;
			section = hashSection === undefined ? null : hashSection;
		} else if (hash.startsWith("sec-")) {
			section = hash;
		}
	}
	return { tab, query, section };
}

export function serializeInspectorUrlState(state: InspectorUrlState, existingSearch = ""): string {
	const params = new URLSearchParams(existingSearch);
	if (state.query === "") params.delete("q");
	else params.set("q", state.query);
	params.delete("tab");
	const search = params.toString();
	const section = state.section === null ? "" : `/${encodeURIComponent(state.section)}`;
	return `${search === "" ? "" : `?${search}`}#${state.tab}${section}`;
}
