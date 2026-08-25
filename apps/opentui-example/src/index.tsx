// Production entry — real terminal renderer, auto-exits after the first
// frames so the session is finite (the e2e uses the headless test renderer
// instead and asserts on captured spans).
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./app.tsx";

const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);
setTimeout(() => process.exit(0), 400);
