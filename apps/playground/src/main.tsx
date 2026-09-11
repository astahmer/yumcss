import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import "pandwind:css";
import "pandwind:ui-css";
import "./base.css";
import { router } from "./router.tsx";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");

createRoot(rootEl).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
