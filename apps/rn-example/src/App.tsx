import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { createCx, createDesignCss } from "pandwind/react-native";
import { examplePreset } from "pandwind/preset";

/* ---------------------------------------------------------------------------
 * rn-example — a real react-native-web host consuming pandwind/react-native.
 *
 * The style objects flowing into `style` props are exactly what a React
 * Native app would receive; RNW processes them with real RN semantics
 * (unitless dp numbers, camelCase props, per-side padding/border props).
 * The `_dark` resolver reads the live toggle state: styles re-resolve on
 * re-render, which is the runtime-only condition story of plan 021.
 * -------------------------------------------------------------------------*/

/** Live dark state read by the resolver at css() call time (render time). */
let isDark = false;

const css = createDesignCss(examplePreset, {
	conditions: { dark: () => isDark },
});
const cx = createCx();

export function App() {
	const [dark, setDark] = useState(false);
	isDark = dark;

	// Shorthand expansion must produce distinct top/side paddings.
	const header = css({
		$frame: { fill: "$blue-500", corners: "lg", pad: [4, 8] },
	});

	// Runtime condition resolution: fill flips with the toggle.
	const body = css({
		$frame: { fill: "$gray-100" },
		_dark: { $frame: { fill: "$gray-900" } },
	});

	// cx merge: conflicting backgroundColors — the later style wins (#3182ce).
	const merged = cx(
		css({ $frame: { fill: "$gray-100", pad: 2 } }),
		css({ $frame: { fill: "$blue-500" } }),
	);

	return (
		<View testID="screen" style={{ flex: 1, padding: 16, gap: 12 }}>
			<View testID="header-card" style={header}>
				<Text testID="header-text">pandwind / react-native</Text>
			</View>
			<View testID="body-card" style={body}>
				<Text>dark mode is {dark ? "ON" : "OFF"}</Text>
			</View>
			<Pressable testID="dark-toggle" onPress={() => setDark((value) => !value)}>
				<Text>DARK MODE</Text>
			</Pressable>
			<View testID="merged-card" style={merged}>
				<Text>cx merged: later wins</Text>
			</View>
		</View>
	);
}
