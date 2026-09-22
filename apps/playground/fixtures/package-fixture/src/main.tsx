import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "pandwind:css";
import { App } from "./app";

const root = document.getElementById("root");
if (root === null) throw new Error("package fixture root is missing");

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
