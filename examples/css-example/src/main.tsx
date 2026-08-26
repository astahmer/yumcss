import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
// The generated atomic stylesheet (tokens + one rule per unique atom),
// extracted from the literal css() calls below by pandwindCssVite.
import "pandwind:css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
