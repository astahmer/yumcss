// Production entry — real terminal renderer, auto-exits after the first
// frames so the session is finite (the e2e uses the headless test renderer
// instead and asserts on captured spans).
//
// Mouse movement tracking is OFF: this is a static dashboard, motion events
// would only spam SGR sequences. Exit goes through renderer.destroy() so the
// terminal gets its mode-restore sequences (mouse tracking off, cursor back,
// screen buffer restored) — a bare process.exit() leaves the TTY emitting
// raw `ESC[<b;x;yM` garbage on every mouse move.
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./app.tsx";

const renderer = await createCliRenderer({
	enableMouseMovement: false,
});
createRoot(renderer).render(<App />);
// Finite session by default (the e2e PTY smoke depends on it). Set
// TUI_KEEP_ALIVE=1 to explore the app interactively — teardown still runs
// on SIGINT/SIGTERM via renderer.destroy().
if (process.env.TUI_KEEP_ALIVE === undefined) {
	setTimeout(() => {
		renderer.destroy();
		process.exit(0);
	}, 400);
} else {
	process.on("SIGINT", () => {
		renderer.destroy();
		process.exit(0);
	});
}
