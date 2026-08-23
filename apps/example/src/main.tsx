import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CssInJsApp } from "./css-in-js-app.tsx";
import { DesignApp } from "./design-app.tsx";
import { DogfoodApp } from "./dogfood-app.tsx";
import "pandwind:css";
import "./tailwind.css";
import { TwApp } from "./tw-app.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
	<StrictMode>
		<TwApp />
		<CssInJsApp />
		<DesignApp />
		<DogfoodApp />
	</StrictMode>,
);
