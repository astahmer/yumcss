import { describe, expect, test } from "vitest";
import { createMigrationPreviewSession } from "./session.ts";
import { createStaticMigrationPreviewHost } from "./static-preview.ts";
import type {
	MigrationPreviewEvaluationRequest,
	MigrationPreviewEvaluationResult,
	MigrationPreviewSnapshot,
	MigrationPreviewWorkspacePort,
	MigrationPreviewWorkspaceSnapshot,
} from "./contracts.ts";

function workspacePort(): MigrationPreviewWorkspacePort & {
	emit(snapshot: MigrationPreviewWorkspaceSnapshot): void;
} {
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
		await session.switchTarget({ source: "styled-components", target: "yumcss/tw" });
		const themed = await session.switchTheme({ scope: '[data-theme="dark"]' });

		expect(themed).toMatchInlineSnapshot(`
			{
			  "evaluation": {
			    "diagnostics": [],
			  },
			  "revision": 5,
			  "schema": "yumcss.migration-preview-snapshot/1",
			  "selection": {
			    "end": 20,
			    "file": "/project/src/App.tsx",
			    "start": 10,
			  },
			  "target": {
			    "source": "styled-components",
			    "target": "yumcss/tw",
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
		expect(requests.at(-1)?.target?.target).toBe("yumcss/tw");
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

test("out-of-order target evaluations publish only the current coherent result", async () => {
	const older = deferred<MigrationPreviewEvaluationResult>();
	const newer = deferred<MigrationPreviewEvaluationResult>();
	const emissions: MigrationPreviewSnapshot[] = [];
	const hostTargets: Array<string | undefined> = [];
	const session = createMigrationPreviewSession({
		workspace: workspacePort(),
		evaluation: {
			evaluate: async (request) => {
				if (request.target?.target === "tailwind") return older.promise;
				if (request.target?.target === "stylex") return newer.promise;
				return { diagnostics: [] };
			},
		},
		preview: {
			id: "target-host",
			available: true,
			start: async () => ({ host: "target-host", status: "ready" }),
			update: async (request) => {
				hostTargets.push(request.target?.target);
				return { host: "target-host", status: "ready" };
			},
		},
	});
	session.subscribe((snapshot) => emissions.push(snapshot));
	await session.open({ root: "/repo" });
	const oldRequest = session.switchTarget({ target: "tailwind" });
	const newRequest = session.switchTarget({ target: "stylex" });
	newer.resolve({ diagnostics: [], semantic: "stylex result" });
	const current = await newRequest;
	older.resolve({ diagnostics: [], semantic: "tailwind result" });
	const superseded = await oldRequest;
	expect(current.target).toEqual({ target: "stylex" });
	expect(current.evaluation?.semantic).toBe("stylex result");
	expect(superseded).toEqual(current);
	expect(emissions).toHaveLength(2);
	expect(emissions.at(-1)).toEqual(current);
	expect(hostTargets).toEqual(["stylex"]);
	await session.close();
});

const deferred = <Value>() => {
	let resolve: ((value: Value) => void) | undefined;
	const promise = new Promise<Value>((complete) => {
		resolve = complete;
	});
	return {
		promise,
		resolve: (value: Value) => {
			if (resolve === undefined) throw new Error("deferred promise was not initialized");
			resolve(value);
		},
	};
};

test("serializes preview host updates and does not publish an obsolete in-flight host result", async () => {
	const oldHost = deferred<void>();
	const oldStarted = deferred<void>();
	const targets: Array<string | undefined> = [];
	const snapshots: MigrationPreviewSnapshot[] = [];
	const session = createMigrationPreviewSession({
		workspace: workspacePort(),
		evaluation: {
			evaluate: async (request) => ({ diagnostics: [], semantic: request.target?.target }),
		},
		preview: {
			id: "host",
			available: true,
			start: async () => ({ host: "host", status: "ready" }),
			update: async (request) => {
				targets.push(request.target?.target);
				if (request.target?.target === "tailwind") {
					oldStarted.resolve();
					await oldHost.promise;
				}
				return { host: "host", status: "ready" };
			},
		},
	});
	await session.open({ root: "/repo" });
	session.subscribe((snapshot) => snapshots.push(snapshot));
	const older = session.switchTarget({ target: "tailwind" });
	await oldStarted.promise;
	const newer = session.switchTarget({ target: "stylex" });
	await Promise.resolve();
	expect(targets).toEqual(["tailwind"]);
	oldHost.resolve();
	const current = await newer;
	expect(await older).toEqual(current);
	expect(targets).toEqual(["tailwind", "stylex"]);
	expect(snapshots).toEqual([current]);
	await session.close();
});

test("closing the session prevents pending evaluations from restarting or publishing previews", async () => {
	const evaluation = deferred<MigrationPreviewEvaluationResult>();
	const snapshots: MigrationPreviewSnapshot[] = [];
	const hostTargets: Array<string | undefined> = [];
	const session = createMigrationPreviewSession({
		workspace: workspacePort(),
		evaluation: {
			evaluate: async (request) =>
				request.target === null ? { diagnostics: [] } : evaluation.promise,
		},
		preview: {
			id: "host",
			available: true,
			start: async () => ({ host: "host", status: "ready" }),
			update: async (request) => {
				hostTargets.push(request.target?.target);
				return { host: "host", status: "ready" };
			},
		},
	});
	await session.open({ root: "/repo" });
	session.subscribe((snapshot) => snapshots.push(snapshot));
	const pending = session.switchTarget({ target: "tailwind" });
	await session.close();
	evaluation.resolve({ diagnostics: [], semantic: "closed" });
	await pending;
	expect(snapshots).toEqual([]);
	expect(hostTargets).toEqual([]);
});
