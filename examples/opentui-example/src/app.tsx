/**
 * pandwind/opentui consumer sandbox — a REAL OpenTUI app (bun +
 * @opentui/react), styled exclusively through the design vocabulary
 * lowered by `pandwind/opentui`.
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
import { createDesignCss } from "pandwind/opentui";
import { examplePreset } from "pandwind/preset";

export interface AppProps {
	/** Boot-time value of the `_dark` resolver (default: light). */
	dark?: boolean;
}

export function App({ dark = false }: AppProps) {
	const dcss = createDesignCss(examplePreset, { conditions: { dark: () => dark } });

	return (
		<box
			style={{
				...dcss({ $frame: { fill: "$blue-500", corners: "lg", pad: [4, 8] } }),
				width: 46,
				flexDirection: "column",
				gap: 1,
			}}
		>
			<text attributes={1}>pandwind / opentui</text>

			<box
				style={{
					// NOTE: token refs must ride the design MODULES ($frame.fill) on
					// object backends — raw top-level props pass through unresolved
					// (token resolution is the web engine's job there).
					...dcss({ $frame: { fill: "$gray-100" }, _dark: { $frame: { fill: "$gray-800" } } }),
					flexDirection: "column",
					gap: 1,
				}}
			>
				<text>status: {dark ? "dark theme active" : "light theme active"}</text>
			</box>

			<box style={{ ...dcss({ $frame: { border: { width: 1, color: "$blue-500" } } }), gap: 1 }}>
				<text>bordered section (border shorthand)</text>
			</box>

			<text>unconditional bottom row</text>
		</box>
	);
}
