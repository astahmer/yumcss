/**
 * Built-in panda pattern tables (plan 024 step 6).
 *
 * Each builtin expands its pattern-specific props into canonical
 * declarations; every OTHER key passes through the normal style pipeline
 * (shorthand expansion, token bridge) as a plain declaration. Expansion is
 * pure data -> data so BOTH the offline converter (function-call form) and
 * the emitted runtime modules share one source of truth.
 */

export interface PatternExpansion {
	style: Record<string, unknown>;
	/** Pattern-specific props consumed by the table (not passthrough decls). */
	consumed: Set<string>;
}

const FLEX_ALIASES: ReadonlyMap<string, string> = new Map([
	["direction", "flexDirection"],
	["align", "alignItems"],
	["justify", "justifyContent"],
	["wrap", "flexWrap"],
	["basis", "flexBasis"],
	["grow", "flexGrow"],
	["shrink", "flexShrink"],
]);

const CENTERED = { display: "flex", alignItems: "center", justifyContent: "center" };

/** Expand one builtin pattern's specific props; unknown keys stay verbatim. */
export function expandBuiltinPattern(
	name: string,
	props: Record<string, unknown>,
): PatternExpansion {
	const style: Record<string, unknown> = {};
	const out: PatternExpansion = { style, consumed: new Set(["css"]) };
	const take = (key: string): unknown => {
		out.consumed.add(key);
		return props[key];
	};

	switch (name) {
		case "stack":
		case "hstack":
		case "vstack": {
			Object.assign(style, { display: "flex" });
			const direction = name === "stack" ? take("direction") : undefined;
			style.flexDirection =
				name === "hstack"
					? "row"
					: name === "vstack"
						? "column"
						: typeof direction === "string" && direction.length > 0
							? direction
							: "column";
			const align = take("align");
			if (align !== undefined) style.alignItems = align;
			const justify = take("justify");
			if (justify !== undefined) style.justifyContent = justify;
			break;
		}
		case "flex": {
			Object.assign(style, { display: "flex" });
			for (const [key, target] of FLEX_ALIASES) {
				const value = take(key);
				if (value !== undefined) style[target] = value;
			}
			break;
		}
		case "grid": {
			Object.assign(style, { display: "grid" });
			const columns = take("columns");
			if (columns !== undefined) {
				style.gridTemplateColumns =
					typeof columns === "number" ? `repeat(${columns}, minmax(0, 1fr))` : String(columns);
			}
			const rows = take("rows");
			if (rows !== undefined) {
				style.gridTemplateRows =
					typeof rows === "number" ? `repeat(${rows}, minmax(0, 1fr))` : String(rows);
			}
			const gap = take("gap");
			if (gap !== undefined) style.gap = gap;
			break;
		}
		case "center":
			Object.assign(style, CENTERED);
			break;
		case "circle": {
			Object.assign(style, CENTERED, { borderRadius: "9999px" });
			const size = take("size");
			if (size !== undefined) {
				style.width = size;
				style.height = size;
			}
			break;
		}
		case "square": {
			Object.assign(style, CENTERED);
			const size = take("size");
			if (size !== undefined) {
				style.width = size;
				style.height = size;
			}
			break;
		}
		case "wrap":
			Object.assign(style, {
				display: "flex",
				flexWrap: "wrap",
				alignItems: "center",
			});
			break;
		default:
			// Unknown/custom pattern — caller falls back to config evaluation.
			return { style: {}, consumed: new Set() };
	}

	// Shared tail keys across patterns.
	for (const key of ["padding", "paddingX", "paddingY"] satisfies string[]) {
		const value = take(key);
		if (value !== undefined) style[key] = value;
	}

	// Everything else is a passthrough declaration (bg="red.300", px="4", …).
	for (const [key, value] of Object.entries(props)) {
		if (!out.consumed.has(key)) style[key] = value;
	}
	return out;
}

/** Builtin pattern names (module emission set when used). */
export const BUILTIN_PATTERNS: ReadonlySet<string> = new Set([
	"stack",
	"hstack",
	"vstack",
	"flex",
	"grid",
	"center",
	"circle",
	"square",
	"wrap",
]);
