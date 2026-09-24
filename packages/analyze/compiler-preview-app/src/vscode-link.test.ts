import { describe, expect, test } from "vitest";
import { vscodeFileUri } from "./vscode-link.ts";

describe("vscodeFileUri", () => {
	test("opens a selected project file and encodes special path characters", () => {
		expect(vscodeFileUri("/Users/example/My Project", "src/Card#1.tsx")).toBe(
			"vscode://file/Users/example/My%20Project/src/Card%231.tsx",
		);
	});

	test("keeps Windows drive paths valid", () => {
		expect(vscodeFileUri("C:\\Users\\example\\project", "src\\Card.tsx")).toBe(
			"vscode://file/C:/Users/example/project/src/Card.tsx",
		);
	});
});
