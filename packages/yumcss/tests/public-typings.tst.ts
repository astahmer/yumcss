/**
 * Type-level pins for the small public helpers added after the original
 * runtime typing sweep. These keep stack and dynamic-value contracts visible
 * to the same tstyche gate as tw/css/cx.
 */
import { expect, test } from "tstyche";
import { createCss } from "yumcss/css";
import { createUnsafeCss } from "yumcss/unsafe/css";
import { createDesignCss } from "yumcss/design";
import type { StackComponentProps as PreactStackProps } from "yumcss/stack/preact";
import type { StackComponentProps as ReactStackProps } from "yumcss/stack/react";
import type { StackComponentProps as SolidStackProps } from "yumcss/stack/solid";
import type { StackComponentProps as VueStackProps } from "yumcss/stack/vue";
import { createStack as createPreactStack } from "yumcss/stack/preact";
import { createStack as createReactStack } from "yumcss/stack/react";
import { createStack as createSolidStack } from "yumcss/stack/solid";
import { createStack as createVueStack } from "yumcss/stack/vue";
import { createStackClassName, stackClasses, type StackProps } from "yumcss/stack";
import { examplePreset } from "@yumcss/example-preset";

const css = createUnsafeCss();
const looseCss = createUnsafeCss();
const typedCss = createCss(examplePreset);
const typedDesignCss = createDesignCss(examplePreset);
const typedReactStack = createReactStack(typedCss);
const typedSolidStack = createSolidStack(typedCss);
const typedVueStack = createVueStack(typedCss);
const typedPreactStack = createPreactStack(typedCss);
const typedDesignStack = createReactStack(typedDesignCss);

test("css.vars returns a class/style carrier", () => {
	const output = css.vars({ color: "var(--runtime-color)" });
	expect(output).type.toBeAssignableTo<{ class: string; style: Record<string, string> }>();
});

test("stackClasses accepts the public stack props", () => {
	const props: StackProps = {
		direction: "column",
		gap: "4",
		padding: "6",
		align: "center",
		justify: "between",
	};
	expect(stackClasses(props)).type.toBe<string>();
	expect(
		stackClasses({ direction: { base: "column", md: "row" }, gap: { base: 2, md: 4 } }),
	).type.toBe<string>();
});

test("createStack binds every renderer to a loose CSS compiler", () => {
	const react = createReactStack(looseCss);
	const solid = createSolidStack(looseCss);
	const vue = createVueStack(looseCss);
	const preact = createPreactStack(looseCss);
	const className = createStackClassName(looseCss)({ gap: 4 });

	expect(react).type.toBeAssignableTo<unknown>();
	expect(solid).type.toBeAssignableTo<unknown>();
	expect(vue).type.toBeAssignableTo<unknown>();
	expect(preact).type.toBeAssignableTo<unknown>();
	expect(className).type.toBe<string>();
});

void typedReactStack;
void typedSolidStack;
void typedVueStack;
void typedPreactStack;
void typedDesignStack;

test("stack direction and alignment values stay constrained", () => {
	// @ts-expect-error is not assignable
	stackClasses({ direction: "diagonal" });
	// @ts-expect-error is not assignable
	stackClasses({ align: "middle" });
	// @ts-expect-error is not assignable
	stackClasses({ direction: { md: "diagonal" } });
});

test("each component renderer accepts its framework-native class prop", () => {
	const react: ReactStackProps = { className: "custom", id: "react" };
	const solid: SolidStackProps = { class: "custom", id: "solid" };
	const vue: VueStackProps = { class: "custom", id: "vue" };
	const preact: PreactStackProps = { className: "custom", id: "preact" };
	expect(react).type.toBeAssignableTo<ReactStackProps>();
	expect(solid).type.toBeAssignableTo<SolidStackProps>();
	expect(vue).type.toBeAssignableTo<VueStackProps>();
	expect(preact).type.toBeAssignableTo<PreactStackProps>();
});
