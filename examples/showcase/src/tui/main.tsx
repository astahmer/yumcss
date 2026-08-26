// Bun entry — real terminal render, clean teardown (restores TTY modes).
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./app.tsx";

const renderer = await createCliRenderer({ enableMouseMovement: false });
createRoot(renderer).render(<App />);
setTimeout(() => {
	renderer.destroy();
	process.exit(0);
}, 400);
