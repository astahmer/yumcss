import { examplePreset } from "@yumcss/example-preset";

/** Resolve verified property bindings at the YumCSS -> native engine boundary. */
export function resolvePreviewValue(key: string, value: string): string {
	if (value.startsWith("input>"))
		throw new Error("This engine cannot compile a YumCSS dynamic input binding");
	const property = key.split("__").at(-1)!;
	const properties: Record<string, unknown> = examplePreset.properties;
	const binding = properties[property];
	if (binding !== null && typeof binding === "object") {
		const entries = binding as Record<string, unknown>;
		const group = entries.$tokens;
		const tokenGroups: Record<string, unknown> = examplePreset.tokens;
		const tokens = typeof group === "string" ? tokenGroups[group] : entries;
		const values =
			tokens !== null && typeof tokens === "object" ? (tokens as Record<string, unknown>) : {};
		const resolved = values[value];
		if (typeof resolved === "string" || typeof resolved === "number") return String(resolved);
	}
	return value;
}

export function nestedPreviewStyle(key: string, value: string): Record<string, unknown> {
	const parts = key.split("__");
	let style: Record<string, unknown> = { [parts.pop()!]: value };
	for (const condition of parts.toReversed()) style = { [condition]: style };
	return style;
}
