import { describe, expect, test } from "vitest";
import { createStudioSession } from "./session.ts";
import type {
	StudioEvaluationRequest,
	StudioWorkspacePort,
	StudioWorkspaceSnapshot,
} from "./contracts.ts";

function workspacePort(): StudioWorkspacePort & { emit(snapshot: StudioWorkspaceSnapshot): void } {
	let listener: ((snapshot: StudioWorkspaceSnapshot) => void) | undefined;
	let current: StudioWorkspaceSnapshot = {
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

describe("createStudioSession", () => {
	test("publishes an injected adapter catalog with every snapshot", async () => {
		const session = createStudioSession({
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

	test("composes workspace edits, selection, target, and theme through one evaluator", async () => {
		const workspace = workspacePort();
		const requests: StudioEvaluationRequest[] = [];
		const session = createStudioSession({
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
			  "schema": "pandwind.studio-snapshot/1",
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
		const session = createStudioSession({
			workspace: workspacePort(),
			evaluation: { evaluate: async () => ({ diagnostics: [] }) },
		});
		await expect(session.select({ file: "/repo/src/App.tsx" })).rejects.toThrow(
			"must be opened before it can be evaluated",
		);
		await session.close();
	});
});
