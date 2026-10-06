/**
 * TUI target — the SAME shared vocabulary through yumcss/opentui.
 * Terminal cells: fill -> span backgrounds, corners -> border model,
 * pad [4, 8] -> per-side cell expansion. `_dark` resolves at boot.
 */
import { createDesignCss } from "yumcss/opentui";
import { examplePreset } from "@yumcss/example-preset";
import { body, header, status } from "../shared-styles.ts";

export interface AppProps {
	dark?: boolean;
}

export function App({ dark = false }: AppProps) {
	const dss = createDesignCss(examplePreset, { conditions: { dark: () => dark } });

	return (
		<box style={{ ...dss({ $frame: { pad: 2 } }), width: 46, height: 12 }}>
			<box data-name="header" style={dss(header)}>
				<text>tui header</text>
			</box>
			<box data-name="status" style={dss(status)}>
				<text>tui status</text>
			</box>
			<box data-name="body" style={dss(body)}>
				<text>tui body</text>
			</box>
		</box>
	);
}
