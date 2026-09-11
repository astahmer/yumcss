import { describe, expect, it } from "vitest";
import { explainPreview } from "./preview-explanation.ts";

const mapping = (input: {
	className: string;
	property: string;
	value: string;
	active?: boolean;
}): {
	className: string;
	property: string;
	value: string;
	conditions: string[];
	active: boolean;
} => ({
	...input,
	conditions: [],
	active: input.active ?? true,
});

describe("explainPreview", () => {
	it("explains the later color declaration in a conflict", () => {
		expect(
			explainPreview({
				kind: "button",
				result: {
					styleMappings: [
						mapping({ className: "bg-blue-500", property: "bgColor", value: "blue-500" }),
						mapping({ className: "bg-blue-600", property: "bgColor", value: "blue-600" }),
					],
					killed: [],
				},
				style: { "background-color": "#2563eb" },
				description: "The selected action is rendered here.",
			}),
		).toBe(
			"button uses blue-600 (#2563eb) for its background color because the later blue-600 declaration overrides blue-500.",
		);
	});

	it("explains when conflict resolution drops an earlier declaration", () => {
		expect(
			explainPreview({
				kind: "card",
				result: {
					styleMappings: [
						mapping({
							className: "demo-backgroundColor-red-500",
							property: "backgroundColor",
							value: "red-500",
							active: false,
						}),
						mapping({
							className: "demo-backgroundColor-blue-500",
							property: "backgroundColor",
							value: "blue-500",
						}),
					],
					killed: ["demo-backgroundColor-red-500"],
				},
				style: { "background-color": "#3b82f6" },
				description: "The selected card is rendered here.",
			}),
		).toBe(
			"card uses blue-500 (#3b82f6) for its background color because the blue-500 declaration survived conflict resolution while red-500 was dropped.",
		);
	});

	it("explains a runtime color when there is no static color mapping", () => {
		expect(
			explainPreview({
				kind: "alert",
				result: {
					styleMappings: [],
					killed: [],
					runtimeStyle: { "--pw-c-color": "red-600" },
				},
				style: {},
				description: "The runtime value is kept on the host.",
			}),
		).toBe(
			"alert uses red-600 for its runtime color because the runtime style supplies --pw-c-color.",
		);
	});

	it("explains runtime color alongside a static background", () => {
		expect(
			explainPreview({
				kind: "alert",
				result: {
					styleMappings: [
						mapping({ className: "bg-red-500", property: "bgColor", value: "red-500" }),
					],
					killed: [],
					runtimeStyle: { "--pw-c-color": "#fef08a" },
				},
				style: { "background-color": "#ef4444" },
				description: "The runtime value is kept on the host.",
			}),
		).toBe(
			"alert uses red-500 (#ef4444) for its background color because the red-500 declaration sets the background color; runtime color #fef08a is carried through the host style.",
		);
	});

	it("explains non-color declarations and responsive variants", () => {
		expect(
			explainPreview({
				kind: "card",
				result: {
					styleMappings: [
						mapping({ className: "p-4", property: "p", value: "4" }),
						{ ...mapping({ className: "sm:p-6", property: "p", value: "6" }), conditions: ["sm"] },
					],
					killed: [],
				},
				style: { padding: "16px" },
				description: "Resize the card.",
			}),
		).toBe(
			"card uses 4 (16px) for its padding because the 4 declaration sets the padding; responsive variants sm are also generated.",
		);
	});

	it("uses the example description when no style declaration exists", () => {
		expect(
			explainPreview({
				kind: "badge",
				result: { styleMappings: [], killed: [] },
				style: {},
				description: "The invalid token has no matching rule.",
			}),
		).toBe("badge has no generated style declaration. The invalid token has no matching rule.");
	});

	it("does not present a malformed variant token as rendered CSS", () => {
		expect(
			explainPreview({
				kind: "badge",
				result: {
					styleMappings: [mapping({ className: "sm-p-4", property: "sm", value: "p-4" })],
					killed: [],
				},
				style: {},
				description: "The emitted token is visible, but it has no matching rule to apply.",
			}),
		).toBe(
			"badge has no generated style declaration. The emitted token is visible, but it has no matching rule to apply.",
		);
	});

	it("recognizes generated sheet rules when group instrumentation has no mapping", () => {
		expect(
			explainPreview({
				kind: "card",
				result: {
					styleMappings: [],
					killed: [],
					sheets: [{ rules: [{}] }],
				},
				style: {},
				description: "Static group styles and runtime input are combined.",
			}),
		).toBe(
			"card uses generated stylesheet rules. Static group styles and runtime input are combined.",
		);
	});

	it("labels token references and state conditions separately", () => {
		expect(
			explainPreview({
				kind: "card",
				result: {
					styleMappings: [
						mapping({ className: "card-bg", property: "backgroundColor", value: "bg.primary" }),
						{
							...mapping({
								className: "card-hover",
								property: "backgroundColor",
								value: "bg.muted",
							}),
							conditions: ["_hover"],
						},
					],
					killed: [],
				},
				style: { "background-color": "#2563eb" },
				description: "The card follows the theme.",
			}),
		).toBe(
			"card uses bg.primary (#2563eb) for its background color because the token ref bg.primary declaration sets the background color; state variants hover are also generated.",
		);
	});
});
