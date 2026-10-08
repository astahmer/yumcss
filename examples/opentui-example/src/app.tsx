/**
 * yumcss/opentui consumer sandbox — a REAL OpenTUI app (bun +
 * @opentui/react), styled exclusively through the design vocabulary
 * lowered by `yumcss/opentui`.
 *
 * What the frame demonstrates, each backed by an e2e assertion:
 * - outer box: $frame tokens (fill $blue-500, corners lg -> radius cells,
 *   pad [4, 8] -> per-side cell expansion) plus a fixed cell width;
 * - status box: a `_dark` condition resolved at boot (off in the base
 *   pass, on in the dark pass) over the same call site;
 * - inner box: the CSS border shorthand (`$frame.border`) expanded to
 *   OpenTUI's boolean border model;
 * - text rows: unconditional and themed content.
 */
import { createDesignCss } from "yumcss/opentui";
import { examplePreset } from "@yumcss/example-preset";

export interface AppProps {
	/** Boot-time value of the `_dark` resolver (default: light). */
	dark?: boolean;
}

export function App({ dark = false }: AppProps) {
	const dss = createDesignCss(examplePreset, { conditions: { dark: () => dark } });

	return (
		<box
			style={{
				...dss({ $frame: { fill: "$blue-500", pad: [4, 8] } }),
				width: 46,
				flexDirection: "column",
				gap: 1,
			}}
		>
			<text attributes={1}>yumcss / opentui</text>

			<box
				style={{
					// NOTE: token refs must ride the design MODULES ($frame.fill) on
					// object backends — raw top-level props pass through unresolved
					// (token resolution is the web engine's job there).
					...dss({ $frame: { fill: "$gray-100" }, _dark: { $frame: { fill: "$gray-800" } } }),
					flexDirection: "column",
					gap: 1,
				}}
			>
				<text>status: {dark ? "dark theme active" : "light theme active"}</text>
			</box>

			<box style={{ ...dss({ $frame: { border: { width: "1px", color: "$blue-500" } } }), gap: 1 }}>
				<text>bordered section (border shorthand)</text>
			</box>

			<text>unconditional bottom row</text>
		</box>
	);
}
