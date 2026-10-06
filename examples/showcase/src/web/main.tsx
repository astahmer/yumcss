import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ShowcaseWeb } from "./App.tsx";
import { ShowcaseNative } from "../native/App.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
	<StrictMode>
		<h1>yumcss showcase — one source, three targets</h1>
		<section data-testid="web-section">
			<h2>web (atomic css classes)</h2>
			<ShowcaseWeb />
		</section>
		<section data-testid="native-section">
			<h2>native (react-native-web host)</h2>
			<ShowcaseNative />
		</section>
	</StrictMode>,
);
