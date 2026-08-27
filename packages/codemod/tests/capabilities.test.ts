import { describe, expect, test } from "vitest";
import {
	ADAPTER_CAPABILITIES_SCHEMA,
	inspectAdapterCapabilities,
	requiredAdapterCapabilities,
	type AdapterCapabilities,
} from "../src/swap/capabilities.ts";
import { STYLE_PROGRAM_SCHEMA, type StyleProgram } from "../src/swap/semantic-ir.ts";

const contract: AdapterCapabilities = {
	schema: ADAPTER_CAPABILITIES_SCHEMA,
	adapter: "test-runtime",
	capabilities: {
		declarations: "exact",
		"media-conditions": "partial",
		"dynamic-values": "unsupported",
	},
};

const program: StyleProgram = {
	schema: STYLE_PROGRAM_SCHEMA,
	declarations: [
		{
			conditions: [{ kind: "media", name: "wide", value: "(min-width: 40rem)" }],
			property: "color",
			value: { kind: "dynamic", expression: "theme.foreground" },
		},
	],
	residuals: [],
};

describe("semantic adapter capability contracts", () => {
	test("reports every required semantic capability", () => {
		expect(requiredAdapterCapabilities(program)).toEqual([
			{ capability: "declarations", detail: "style declarations" },
			{ capability: "media-conditions", detail: "media: wide" },
			{ capability: "dynamic-values", detail: "dynamic: theme.foreground" },
		]);
	});

	test("safe mode blocks partial and unsupported semantics", () => {
		const report = inspectAdapterCapabilities(contract, program, "safe");
		expect(report.convertible).toBe(false);
		expect(report.partial.map((issue) => issue.capability)).toEqual(["media-conditions"]);
		expect(report.unsupported.map((issue) => issue.capability)).toEqual(["dynamic-values"]);
		expect(report.blockers.map((issue) => issue.capability)).toEqual([
			"media-conditions",
			"dynamic-values",
		]);
	});

	test("partial mode allows declared partial support but never unknown support", () => {
		const report = inspectAdapterCapabilities(contract, program, "partial");
		expect(report.convertible).toBe(false);
		expect(report.blockers.map((issue) => issue.capability)).toEqual(["dynamic-values"]);

		const staticReport = inspectAdapterCapabilities(
			contract,
			{
				...program,
				declarations: [{ ...program.declarations[0]!, value: { kind: "literal", value: "red" } }],
			},
			"partial",
		);
		expect(staticReport.convertible).toBe(true);
	});
});
