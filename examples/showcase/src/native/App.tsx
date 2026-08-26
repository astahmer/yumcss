/**
 * NATIVE target — the SAME shared vocabulary objects consumed through
 * pandwind/react-native: RN StyleSheet objects (unitless dp numbers,
 * per-side padding expansion) rendered by a react-native-web host.
 *
 * `_dark` resolves at render time via the injected resolver — flipping
 * `isDark` re-renders with $gray-900.
 */
import { useState } from "react";
import { Text, View } from "react-native";
import { createDesignCss } from "pandwind/react-native";
import { examplePreset } from "pandwind/preset";
import { body, header, status } from "../shared-styles.ts";

let isDark = false;

const css = createDesignCss(examplePreset, {
	conditions: { dark: () => isDark },
});

export function ShowcaseNative() {
	const [dark, setDark] = useState(false);
	isDark = dark;

	return (
		<View testID="native-root" style={{ flexDirection: "row", gap: 12 }}>
			<View testID="native-header" style={css(header)}>
				<Text>native header</Text>
			</View>
			<View testID="native-status" style={css(status)}>
				<Text>native status</Text>
			</View>
			<View testID="native-body" style={css(body)}>
				<Text>native body</Text>
			</View>
			<View testID="native-dark-toggle">
				<Text onPress={() => setDark(!dark)}>toggle dark</Text>
			</View>
		</View>
	);
}
