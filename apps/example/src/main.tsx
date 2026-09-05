import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CssInJsApp } from "./css-in-js-app.tsx";
import { DesignApp } from "./design-app.tsx";
import { DogfoodApp } from "./dogfood-app.tsx";
import "pandwind:css";
import "./base.css";
import { AtomicApp } from "./atomic-app.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
	<StrictMode>
		<AtomicApp />
		<CssInJsApp />
		<DesignApp />
		<DogfoodApp />
	</StrictMode>,
);
