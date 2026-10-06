/**
 * NATIVE target — the SAME shared vocabulary objects consumed through
 * yumcss/react-native: RN StyleSheet objects (unitless dp numbers,
 * per-side padding expansion) rendered by a react-native-web host.
 *
 * `_dark` resolves at render time via the injected resolver — flipping
 * `isDark` re-renders with $gray-900.
 */
import { useState } from "react";
import { Text, View } from "react-native";
import { createDesignCss } from "yumcss/react-native";
import { examplePreset } from "@yumcss/example-preset";
import { body, header, status } from "../shared-styles.ts";

let isDark = false;

const dss = createDesignCss(examplePreset, {
	conditions: { dark: () => isDark },
});

export function ShowcaseNative() {
	const [dark, setDark] = useState(false);
	isDark = dark;

	return (
		<View testID="native-root" style={{ flexDirection: "row", gap: 12 }}>
			<View testID="native-header" style={dss(header)}>
				<Text>native header</Text>
			</View>
			<View testID="native-status" style={dss(status)}>
				<Text>native status</Text>
			</View>
			<View testID="native-body" style={dss(body)}>
				<Text>native body</Text>
			</View>
			<View testID="native-dark-toggle">
				<Text onPress={() => setDark(!dark)}>toggle dark</Text>
			</View>
		</View>
	);
}
