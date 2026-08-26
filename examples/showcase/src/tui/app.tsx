/**
 * TUI target — the SAME shared vocabulary through pandwind/opentui.
 * Terminal cells: fill -> span backgrounds, corners -> border model,
 * pad [4, 8] -> per-side cell expansion. `_dark` resolves at boot.
 */
import { createDesignCss } from "pandwind/opentui";
import { examplePreset } from "pandwind/preset";
import { body, header, status } from "../shared-styles.ts";

export interface AppProps {
	dark?: boolean;
}

export function App({ dark = false }: AppProps) {
	const css = createDesignCss(examplePreset, { conditions: { dark: () => dark } });

	return (
		<box style={{ ...css({ $frame: { pad: 2 } }), width: 46, height: 12 }}>
			<box data-name="header" style={css(header)}>
				<text>tui header</text>
			</box>
			<box data-name="status" style={css(status)}>
				<text>tui status</text>
			</box>
			<box data-name="body" style={css(body)}>
				<text>tui body</text>
			</box>
		</box>
	);
}
