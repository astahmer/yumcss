import { describe, expect, it } from "vitest";
import type { ExamplePreviewControl } from "./examples.ts";
import { applyPreviewControls, initialPreviewControlValues } from "./preview-controls.ts";

const controls: readonly ExamplePreviewControl[] = [
	{
		type: "select",
		id: "size",
		prop: "size",
		label: "Size",
		initialValue: "lg",
		options: [
			{ label: "sm", value: "sm" },
			{ label: "lg", value: "lg" },
		],
		description: "Select a size.",
	},
	{
		type: "select",
		id: "active",
		prop: "active",
		label: "State",
		initialValue: "true",
		options: [
			{ label: "active", value: "true", sourceValue: "true" },
			{ label: "inactive", value: "false", sourceValue: "false" },
		],
		description: "Select a state.",
	},
];

describe("preview controls", () => {
	it("defaults to the authored initial values", () => {
		const source =
			'const Button = (props: { size: string; active: boolean }) => <button />;\nexport default <Button size="lg" active={true} />;';
		expect(initialPreviewControlValues(controls)).toEqual({ size: "lg", active: "true" });
		expect(applyPreviewControls(source, controls, initialPreviewControlValues(controls))).toBe(
			source,
		);
	});

	it("changes only matching props on the default exported JSX element", () => {
		const source = [
			"const Button = (props: { size: string; active: boolean }) => <button data-size={props.size} />;",
			'export default <Button size="lg" active={true} />;',
		].join("\n");

		expect(applyPreviewControls(source, controls, { size: "sm", active: "false" })).toBe(
			[
				"const Button = (props: { size: string; active: boolean }) => <button data-size={props.size} />;",
				'export default <Button size="sm" active={false} />;',
			].join("\n"),
		);
	});

	it("leaves component-function exports unchanged", () => {
		const source = "const Button = () => <button />;\nexport default Button;";
		expect(applyPreviewControls(source, controls, { size: "sm", active: "false" })).toBe(source);
	});
});
