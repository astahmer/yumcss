import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

// The host is react-native-web: source imports say "react-native" (real RN
// app shape) and are aliased to the web implementation of RN semantics.
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"react-native": "react-native-web",
		},
	},
});
