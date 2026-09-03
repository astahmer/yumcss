import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createStudioWorkspace, type StudioWorkspaceWatcher } from "./workspace.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

const createProject = (): string => {
	const root = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "pandwind-studio-"));
	mkdirSync(join(root, "src"));
	writeFileSync(
		join(root, "src", "Card.tsx"),
		'export const Card = () => <div className="card" />;',
	);
	writeFileSync(join(root, "README.md"), "not a source document");
	roots.push(root);
	return root;
};

describe("studio workspace", () => {
	test("opens shared source documents and applies edits in memory", async () => {
		const root = createProject();
		const workspace = createStudioWorkspace({
			watcher: {
				watch: () => () => undefined,
			} satisfies StudioWorkspaceWatcher,
		});

		const opened = await workspace.open({ root, patterns: ["src/**/*"] });
		const edited = await workspace.edit({
			file: "src/Card.tsx",
			source: 'export const Card = () => <button className="card" />;',
		});

		expect(opened.files).toHaveLength(1);
		expect(edited.files[0]?.document.source).toContain("<button");
		expect(edited.files[0]?.scan.program?.type).toBe("Program");
		expect(edited.revision).toBeGreaterThan(opened.revision);
		expect({
			revision: edited.revision,
			root: "<root>",
			files: edited.files.map(({ document, scan }) => ({
				file: document.file.replace(root, "<root>"),
				source: document.source,
				language: scan.language,
				framework: scan.framework,
				diagnostics: scan.diagnostics,
			})),
		}).toMatchInlineSnapshot(`
			{
			  "files": [
			    {
			      "diagnostics": [],
			      "file": "<root>/src/Card.tsx",
			      "framework": undefined,
			      "language": "tsx",
			      "source": "export const Card = () => <button className="card" />;",
			    },
			  ],
			  "revision": 2,
			  "root": "<root>",
			}
		`);
	});

	test("refreshes from disk through the injected watcher", async () => {
		const root = createProject();
		let notifyFile: ((file: string) => void) | undefined;
		const changes: number[] = [];
		const workspace = createStudioWorkspace({
			watcher: {
				watch: (_root, onChange) => {
					notifyFile = onChange;
					return () => undefined;
				},
			} satisfies StudioWorkspaceWatcher,
		});
		workspace.subscribe((snapshot) => changes.push(snapshot.revision));
		await workspace.open({ root, patterns: ["src/**/*"] });
		writeFileSync(join(root, "src", "Card.tsx"), "export const Card = () => <span />;");
		notifyFile?.(join(root, "src", "Card.tsx"));

		const refreshed = await workspace.edit({
			file: "src/Card.tsx",
			source: "export const Card = () => <strong />;",
		});
		expect(changes.length).toBe(3);
		expect(refreshed.files[0]?.document.source).toContain("<strong");
	});

	test("rejects edits outside the opened source workspace", async () => {
		const root = createProject();
		const workspace = createStudioWorkspace({ watcher: { watch: () => () => undefined } });
		await workspace.open({ root, patterns: ["src/**/*"] });

		await expect(workspace.edit({ file: "../outside.ts", source: "export {};" })).rejects.toThrow(
			"outside the workspace",
		);
		await expect(workspace.edit({ file: "src/Missing.tsx", source: "export {};" })).rejects.toThrow(
			"not an opened source document",
		);
	});
});
