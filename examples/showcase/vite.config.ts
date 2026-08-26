import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

// One page, two DOM targets: web resolves the shared vocabulary at runtime
// (css.raw); native is react-native-web (aliased) processing real RN style
// objects. The tui target runs under bun.
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: { "react-native": "react-native-web" },
	},
});
