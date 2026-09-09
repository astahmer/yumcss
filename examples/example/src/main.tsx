import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MixedApisApp } from "./examples/mixed-apis-app.tsx";
import "pandwind:css";
import "./base.css";
import "./tailwind.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
	<StrictMode>
		<MixedApisApp />
	</StrictMode>,
);
