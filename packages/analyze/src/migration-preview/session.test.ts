import { describe, expect, test } from "vitest";
import { createMigrationPreviewSession } from "./session.ts";
import { createStaticMigrationPreviewHost } from "./static-preview.ts";
import type {
	MigrationPreviewEvaluationRequest,
	MigrationPreviewWorkspacePort,
	MigrationPreviewWorkspaceSnapshot,
} from "./contracts.ts";

function workspacePort(): MigrationPreviewWorkspacePort & { emit(snapshot: MigrationPreviewWorkspaceSnapshot): void } {
	let listener: ((snapshot: MigrationPreviewWorkspaceSnapshot) => void) | undefined;
	let current: MigrationPreviewWorkspaceSnapshot = {
		revision: 0,
		root: "/repo",
		files: [],
	};
	return {
		async open(request) {
			current = { ...current, root: request.root, revision: current.revision + 1 };
			return current;
		},
		async edit(request) {
			void request;
			current = { ...current, revision: current.revision + 1 };
			return current;
		},
		subscribe(next) {
			listener = next;
			return () => {
				listener = undefined;
			};
		},
		emit(snapshot) {
			current = snapshot;
			listener?.(snapshot);
		},
	};
}

describe("createMigrationPreviewSession", () => {
	test("publishes an injected adapter catalog with every snapshot", async () => {
		const session = createMigrationPreviewSession({
			workspace: workspacePort(),
			evaluation: { evaluate: async () => ({ diagnostics: [] }) },
			adapters: {
				list: async () => ({
					sources: [{ id: "source", label: "Source", role: "source" }],
					targets: [{ id: "target", label: "Target", role: "target" }],
				}),
			},
		});

		const snapshot = await session.open({ root: "/project" });

		expect(snapshot.adapters).toMatchInlineSnapshot(`
			{
			  "sources": [
			    {
			      "id": "source",
			      "label": "Source",
			      "role": "source",
			    },
			  ],
			  "targets": [
			    {
			      "id": "target",
			      "label": "Target",
			      "role": "target",
			    },
			  ],
			}
		`);
		await session.close();
	});

	test("keeps host preview lifecycle behind the preview port", async () => {
		const calls: string[] = [];
		const session = createMigrationPreviewSession({
			workspace: workspacePort(),
			evaluation: { evaluate: async () => ({ diagnostics: [] }) },
			preview: {
				id: "test-host",
				available: true,
				async start() {
					calls.push("start");
					return { host: "test-host", status: "ready", url: "http://127.0.0.1:3000" };
				},
				async update() {
					calls.push("update");
					return { host: "test-host", status: "ready" };
				},
				async stop() {
					calls.push("stop");
				},
			},
		});

		const opened = await session.open({ root: "/project" });
		const selected = await session.select({ file: "/project/src/App.tsx" });
		await session.close();

		expect({
			calls,
			opened: opened.preview,
			selected: selected.preview,
		}).toMatchInlineSnapshot(`
			{
			  "calls": [
			    "start",
			    "update",
			    "stop",
			  ],
			  "opened": {
			    "host": "test-host",
			    "status": "ready",
			    "url": "http://127.0.0.1:3000",
			  },
			  "selected": {
			    "host": "test-host",
			    "status": "ready",
			  },
			}
		`);
	});

	test("reports static mode when no host preview is available", async () => {
		const session = createMigrationPreviewSession({
			workspace: workspacePort(),
			evaluation: { evaluate: async () => ({ diagnostics: [] }) },
			preview: { id: "react-vite", available: false },
		});

		const snapshot = await session.open({ root: "/project" });

		expect(snapshot.preview).toMatchInlineSnapshot(`
			{
			  "host": "react-vite",
			  "message": "No supported host preview is configured for this project",
			  "status": "unavailable",
			}
		`);
		await session.close();
	});

	test("provides static mode through the replaceable preview contract", () => {
		expect(createStaticMigrationPreviewHost()).toMatchInlineSnapshot(`
			{
			  "available": false,
			  "id": "static",
			}
		`);
	});

	test("composes workspace edits, selection, target, and theme through one evaluator", async () => {
		const workspace = workspacePort();
		const requests: MigrationPreviewEvaluationRequest[] = [];
		const session = createMigrationPreviewSession({
			workspace,
			evaluation: {
				async evaluate(request) {
					requests.push(request);
					return { diagnostics: [] };
				},
			},
		});

		const updates: number[] = [];
		const unsubscribe = session.subscribe((snapshot) => updates.push(snapshot.revision));
		const opened = await session.open({ root: "/project", patterns: ["src/**/*.tsx"] });
		await session.edit({ file: "/project/src/App.tsx", source: "const App = () => null;" });
		await session.select({ file: "/project/src/App.tsx", start: 10, end: 20 });
		await session.switchTarget({ source: "styled-components", target: "pandwind/tw" });
		const themed = await session.switchTheme({ scope: '[data-theme="dark"]' });

		expect(themed).toMatchInlineSnapshot(`
			{
			  "evaluation": {
			    "diagnostics": [],
			  },
			  "revision": 5,
			  "schema": "pandwind.migration-preview-snapshot/1",
			  "selection": {
			    "end": 20,
			    "file": "/project/src/App.tsx",
			    "start": 10,
			  },
			  "target": {
			    "source": "styled-components",
			    "target": "pandwind/tw",
			  },
			  "theme": {
			    "scope": "[data-theme="dark"]",
			  },
			  "workspace": {
			    "files": [],
			    "revision": 2,
			    "root": "/project",
			  },
			}
		`);
		expect(opened.workspace.root).toBe("/project");
		expect(requests.at(-1)?.target?.target).toBe("pandwind/tw");
		expect(requests.at(-1)?.theme.scope).toBe('[data-theme="dark"]');
		expect(updates).toEqual([1, 2, 3, 4, 5]);

		unsubscribe();
		workspace.emit({ revision: 2, root: "/project", files: [] });
		expect(updates).toEqual([1, 2, 3, 4, 5]);
		await session.close();
	});

	test("rejects evaluation before the workspace is opened", async () => {
		const session = createMigrationPreviewSession({
			workspace: workspacePort(),
			evaluation: { evaluate: async () => ({ diagnostics: [] }) },
		});
		await expect(session.select({ file: "/repo/src/App.tsx" })).rejects.toThrow(
			"must be opened before it can be evaluated",
		);
		await session.close();
	});
});
