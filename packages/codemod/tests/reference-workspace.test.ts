import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createReferenceWorkspace } from "../../../scripts/reference-workspace.ts";

describe("reference workspace", () => {
	test("maps logical corpus ids to their pinned checkout", () => {
		const workspace = createReferenceWorkspace("/tmp/pandwind-reference-test");

		expect(workspace.path("panda-website")).toBe(join(workspace.root, "panda"));
		expect(workspace.path("stylex/packages/docs")).toBe(
			join(workspace.root, "stylex/packages/docs"),
		);
	});
});
