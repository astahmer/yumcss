import { describe, expect, test } from "vitest";
import {
	pandwindMigrateBun,
	pandwindMigrateEsbuild,
	pandwindMigrateFarm,
	pandwindMigrateRolldown,
	pandwindMigrateRollup,
	pandwindMigrateRsbuild,
	pandwindMigrateRspack,
	pandwindMigrateUnloader,
	pandwindMigrateUnplugin,
	pandwindMigrateVite,
	pandwindMigrateWebpack,
} from "../src/swap/unplugin.ts";
import { CodemodAdapterId } from "../src/swap/index.ts";

const options = {
	from: CodemodAdapterId.StyledComponents,
	to: CodemodAdapterId.Tailwind,
	root: "/virtual/project",
};

const styledCard = `import styled from "styled-components";

const Card = styled.div\`
\tcolor: red;
\tpadding: 1rem;
\`;

export function App() {
\treturn <Card>content</Card>;
}
`;

const standardHosts = ["rollup", "vite", "rolldown", "unloader", "farm"] as const;
const sourceMapReferencePrefix = ["sourceMapping", "URL="].join("");
const sourceMapReference = (path: string) => `${sourceMapReferencePrefix}${path}`;
type HostResult = { readonly code: string; readonly map: object } | null;
type HostRecord = { readonly name: string; readonly result: HostResult };
describe("codemod unplugin factory", () => {
	test("publishes one factory and every unplugin platform slice", () => {
		expect({
			factory: typeof pandwindMigrateUnplugin,
			vite: typeof pandwindMigrateVite,
			rollup: typeof pandwindMigrateRollup,
			rolldown: typeof pandwindMigrateRolldown,
			webpack: typeof pandwindMigrateWebpack,
			rspack: typeof pandwindMigrateRspack,
			rsbuild: typeof pandwindMigrateRsbuild,
			esbuild: typeof pandwindMigrateEsbuild,
			farm: typeof pandwindMigrateFarm,
			bun: typeof pandwindMigrateBun,
			unloader: typeof pandwindMigrateUnloader,
		}).toMatchInlineSnapshot(`
			{
			  "bun": "function",
			  "esbuild": "function",
			  "factory": "object",
			  "farm": "function",
			  "rolldown": "function",
			  "rollup": "function",
			  "rsbuild": "function",
			  "rspack": "function",
			  "unloader": "function",
			  "vite": "function",
			  "webpack": "function",
			}
		`);
	});

	test("runs the same migration use case for every Rollup-compatible host", async () => {
		const results: Record<string, HostRecord> = Object.fromEntries(
			await Promise.all(
				standardHosts.map(async (framework) => {
					const plugin = pandwindMigrateUnplugin.raw(options, {
						framework,
						versions: {},
					});
					if (typeof plugin.transform !== "function") {
						throw new Error(`${framework} plugin has no transform hook`);
					}
					const result = await plugin.transform(styledCard, "/virtual/project/Card.tsx");
					return [framework, { name: plugin.name, result }];
				}),
			),
		);

		const summaries = Object.fromEntries(
			Object.entries(results).map(([framework, value]) => [
				framework,
				{
					...value,
					result: value.result === null ? null : { code: value.result.code, map: "present" },
				},
			]),
		);

		expect(summaries).toMatchInlineSnapshot(`
			{
			  "farm": {
			    "name": "pandwind:virtual-migration:styled-components->tailwind",
			    "result": {
			      "code": "import { forwardRef as __pandwindCardForwardRef } from "react";
			import type { ComponentPropsWithoutRef as __pandwindCardPropsWithoutRef, ComponentRef as __pandwindCardRef, ElementType as __pandwindCardElementType, ReactElement as __pandwindCardReactElement, Ref as __pandwindCardRefProp } from "react";

			const Card = (() => { type __pandwindCardProps<C extends __pandwindCardElementType> = Omit<__pandwindCardPropsWithoutRef<C>, "as" | "forwardedAs" | "className" | "style"> & { as?: C; forwardedAs?: C; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindCardComponent = <C extends __pandwindCardElementType = "div">(props: __pandwindCardProps<C> & { ref?: __pandwindCardRefProp<__pandwindCardRef<C>> }) => __pandwindCardReactElement | null; type __pandwindCardRuntimeProps = Record<string, any>; return __pandwindCardForwardRef<__pandwindCardRef<"div">, __pandwindCardRuntimeProps>((props, ref) => { const Component = props.as ?? props.forwardedAs ?? "div"; const { as: _as, forwardedAs: _forwardedAs, ...rest } = props; return <Component {...Object.fromEntries(Object.entries(rest).filter(([key]) => !["$"].some((prefix) => key.startsWith(prefix))))} ref={ref} className={["[color:red] [padding:1rem]", props.className].filter(Boolean).join(" ")} />; }) as __pandwindCardComponent; })();

			export function App() {
				return <Card>content</Card>;
			}
			",
			      "map": "present",
			    },
			  },
			  "rolldown": {
			    "name": "pandwind:virtual-migration:styled-components->tailwind",
			    "result": {
			      "code": "import { forwardRef as __pandwindCardForwardRef } from "react";
			import type { ComponentPropsWithoutRef as __pandwindCardPropsWithoutRef, ComponentRef as __pandwindCardRef, ElementType as __pandwindCardElementType, ReactElement as __pandwindCardReactElement, Ref as __pandwindCardRefProp } from "react";

			const Card = (() => { type __pandwindCardProps<C extends __pandwindCardElementType> = Omit<__pandwindCardPropsWithoutRef<C>, "as" | "forwardedAs" | "className" | "style"> & { as?: C; forwardedAs?: C; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindCardComponent = <C extends __pandwindCardElementType = "div">(props: __pandwindCardProps<C> & { ref?: __pandwindCardRefProp<__pandwindCardRef<C>> }) => __pandwindCardReactElement | null; type __pandwindCardRuntimeProps = Record<string, any>; return __pandwindCardForwardRef<__pandwindCardRef<"div">, __pandwindCardRuntimeProps>((props, ref) => { const Component = props.as ?? props.forwardedAs ?? "div"; const { as: _as, forwardedAs: _forwardedAs, ...rest } = props; return <Component {...Object.fromEntries(Object.entries(rest).filter(([key]) => !["$"].some((prefix) => key.startsWith(prefix))))} ref={ref} className={["[color:red] [padding:1rem]", props.className].filter(Boolean).join(" ")} />; }) as __pandwindCardComponent; })();

			export function App() {
				return <Card>content</Card>;
			}
			",
			      "map": "present",
			    },
			  },
			  "rollup": {
			    "name": "pandwind:virtual-migration:styled-components->tailwind",
			    "result": {
			      "code": "import { forwardRef as __pandwindCardForwardRef } from "react";
			import type { ComponentPropsWithoutRef as __pandwindCardPropsWithoutRef, ComponentRef as __pandwindCardRef, ElementType as __pandwindCardElementType, ReactElement as __pandwindCardReactElement, Ref as __pandwindCardRefProp } from "react";

			const Card = (() => { type __pandwindCardProps<C extends __pandwindCardElementType> = Omit<__pandwindCardPropsWithoutRef<C>, "as" | "forwardedAs" | "className" | "style"> & { as?: C; forwardedAs?: C; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindCardComponent = <C extends __pandwindCardElementType = "div">(props: __pandwindCardProps<C> & { ref?: __pandwindCardRefProp<__pandwindCardRef<C>> }) => __pandwindCardReactElement | null; type __pandwindCardRuntimeProps = Record<string, any>; return __pandwindCardForwardRef<__pandwindCardRef<"div">, __pandwindCardRuntimeProps>((props, ref) => { const Component = props.as ?? props.forwardedAs ?? "div"; const { as: _as, forwardedAs: _forwardedAs, ...rest } = props; return <Component {...Object.fromEntries(Object.entries(rest).filter(([key]) => !["$"].some((prefix) => key.startsWith(prefix))))} ref={ref} className={["[color:red] [padding:1rem]", props.className].filter(Boolean).join(" ")} />; }) as __pandwindCardComponent; })();

			export function App() {
				return <Card>content</Card>;
			}
			",
			      "map": "present",
			    },
			  },
			  "unloader": {
			    "name": "pandwind:virtual-migration:styled-components->tailwind",
			    "result": {
			      "code": "import { forwardRef as __pandwindCardForwardRef } from "react";
			import type { ComponentPropsWithoutRef as __pandwindCardPropsWithoutRef, ComponentRef as __pandwindCardRef, ElementType as __pandwindCardElementType, ReactElement as __pandwindCardReactElement, Ref as __pandwindCardRefProp } from "react";

			const Card = (() => { type __pandwindCardProps<C extends __pandwindCardElementType> = Omit<__pandwindCardPropsWithoutRef<C>, "as" | "forwardedAs" | "className" | "style"> & { as?: C; forwardedAs?: C; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindCardComponent = <C extends __pandwindCardElementType = "div">(props: __pandwindCardProps<C> & { ref?: __pandwindCardRefProp<__pandwindCardRef<C>> }) => __pandwindCardReactElement | null; type __pandwindCardRuntimeProps = Record<string, any>; return __pandwindCardForwardRef<__pandwindCardRef<"div">, __pandwindCardRuntimeProps>((props, ref) => { const Component = props.as ?? props.forwardedAs ?? "div"; const { as: _as, forwardedAs: _forwardedAs, ...rest } = props; return <Component {...Object.fromEntries(Object.entries(rest).filter(([key]) => !["$"].some((prefix) => key.startsWith(prefix))))} ref={ref} className={["[color:red] [padding:1rem]", props.className].filter(Boolean).join(" ")} />; }) as __pandwindCardComponent; })();

			export function App() {
				return <Card>content</Card>;
			}
			",
			      "map": "present",
			    },
			  },
			  "vite": {
			    "name": "pandwind:virtual-migration:styled-components->tailwind",
			    "result": {
			      "code": "import { forwardRef as __pandwindCardForwardRef } from "react";
			import type { ComponentPropsWithoutRef as __pandwindCardPropsWithoutRef, ComponentRef as __pandwindCardRef, ElementType as __pandwindCardElementType, ReactElement as __pandwindCardReactElement, Ref as __pandwindCardRefProp } from "react";

			const Card = (() => { type __pandwindCardProps<C extends __pandwindCardElementType> = Omit<__pandwindCardPropsWithoutRef<C>, "as" | "forwardedAs" | "className" | "style"> & { as?: C; forwardedAs?: C; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindCardComponent = <C extends __pandwindCardElementType = "div">(props: __pandwindCardProps<C> & { ref?: __pandwindCardRefProp<__pandwindCardRef<C>> }) => __pandwindCardReactElement | null; type __pandwindCardRuntimeProps = Record<string, any>; return __pandwindCardForwardRef<__pandwindCardRef<"div">, __pandwindCardRuntimeProps>((props, ref) => { const Component = props.as ?? props.forwardedAs ?? "div"; const { as: _as, forwardedAs: _forwardedAs, ...rest } = props; return <Component {...Object.fromEntries(Object.entries(rest).filter(([key]) => !["$"].some((prefix) => key.startsWith(prefix))))} ref={ref} className={["[color:red] [padding:1rem]", props.className].filter(Boolean).join(" ")} />; }) as __pandwindCardComponent; })();

			export function App() {
				return <Card>content</Card>;
			}
			",
			      "map": "present",
			    },
			  },
			}
		`);
		for (const value of Object.values(results)) {
			expect(value.result?.code).toContain(
				'className={["[color:red] [padding:1rem]", props.className].filter(Boolean).join(" ")}',
			);
			const serializedMap = value.result === null ? "" : String(value.result.map);
			expect(serializedMap).toContain('"sources":["/virtual/project/Card.tsx"]');
			expect(serializedMap).not.toContain('"mappings":""');
		}
	});

	test("the Vite platform slice retains config-root lifecycle hooks", () => {
		const plugin = pandwindMigrateVite(options);
		expect(plugin).toHaveProperty("configResolved");
		expect(plugin).toMatchObject({
			name: "pandwind:virtual-migration:styled-components->tailwind",
			enforce: "pre",
		});
	});

	test("serves generated CSS Modules virtually without writing project files", async () => {
		const sourceFile = "/virtual/project/src/Card.tsx";
		const source =
			'import styled from "styled-components";\n' +
			'export const Card = styled.div({ color: "red", padding: "1rem" });\n' +
			'export const unchanged = "preserved";';
		const files = new Map([[sourceFile, source]]);
		const residuals: unknown[] = [];
		const plugin = pandwindMigrateUnplugin.raw(
			{
				from: CodemodAdapterId.StyledComponents,
				to: CodemodAdapterId.CssModules,
				root: "/virtual/project",
					readFile: (file) => files.get(file),
					listFiles: () => [...files.keys()],
					onResidual: (event) => residuals.push(event),
				},
				{ framework: "vite", versions: {} },
		);
		if (
			typeof plugin.transform !== "function" ||
			typeof plugin.resolveId !== "function" ||
			typeof plugin.load !== "function"
		) {
			throw new Error("Vite migration plugin is missing a virtual module hook");
		}
		const transformed = await plugin.transform(source, sourceFile);
		const stylesheetId = plugin.resolveId("./Card.module.css", sourceFile);
		const stylesheet = stylesheetId === null ? null : plugin.load(stylesheetId);
		const stylesheetMapId =
			stylesheetId === null ? null : plugin.resolveId("./Card.module.css.map", stylesheetId);
		const stylesheetMap = stylesheetMapId === null ? null : plugin.load(stylesheetMapId);
		const serializedMap = transformed === null ? "" : String(transformed.map);

		expect({
			transformed:
				transformed === null
					? null
					: { code: transformed.code, map: transformed.map === null ? null : "present" },
			stylesheetId,
			stylesheet: stylesheet?.replace(sourceMapReferencePrefix, "mapReference=") ?? null,
			stylesheetMapId,
			stylesheetMap: stylesheetMap === null ? null : "present",
			residuals,
			files: [...files.entries()],
		}).toMatchInlineSnapshot(`
			{
			  "files": [
			    [
			      "/virtual/project/src/Card.tsx",
			      "import styled from "styled-components";
			export const Card = styled.div({ color: "red", padding: "1rem" });
			export const unchanged = "preserved";",
			    ],
			  ],
			  "residuals": [],
			  "stylesheet": ".root { color: red; padding: 1rem; }
			/*# mapReference=Card.module.css.map */
			",
			  "stylesheetId": " pandwind:migration:/virtual/project/src/Card.module.css",
			  "stylesheetMap": "present",
			  "stylesheetMapId": " pandwind:migration:/virtual/project/src/Card.module.css.map",
			  "transformed": {
			    "code": "import __pandwindCardStyles from "./Card.module.css";
			import { createElement as __pandwindCardCreateElement, forwardRef as __pandwindCardForwardRef } from "react";
			import type { ComponentRef as __pandwindCardComponentRef, ComponentPropsWithoutRef as __pandwindCardComponentProps } from "react";
			export const Card = (() => { type __pandwindCardProps<As extends import("react").ElementType> = Omit<__pandwindCardComponentProps<As>, "as" | "forwardedAs" | "className" | "style"> & { as?: As; forwardedAs?: As; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindCardPolymorphicComponent = <As extends import("react").ElementType = "div">(props: __pandwindCardProps<As> & { ref?: import("react").Ref<__pandwindCardComponentRef<As>> }) => import("react").ReactElement | null; type __pandwindCardInternalProps = { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly forwardedAs?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; return __pandwindCardForwardRef<unknown, __pandwindCardInternalProps>((props, ref) => { const { as: propsAs, forwardedAs: propsForwardedAs, className, style, ...rest } = props; const attrs: { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } = ({}); const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const Component = (attrsAs ?? propsAs ?? propsForwardedAs ?? "div") as import("react").ElementType; return __pandwindCardCreateElement(Component, { ...Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))), ref, className: [__pandwindCardStyles.root, attrsClassName, className].filter(Boolean).join(" "), style: Object.assign({}, style, attrsStyle) } as import("react").ComponentPropsWithRef<import("react").ElementType>); }) as __pandwindCardPolymorphicComponent; })();
			export const unchanged = "preserved";",
			    "map": "present",
			  },
			}
		`);
		expect(transformed?.code).toContain('import __pandwindCardStyles from "./Card.module.css";');
		expect(stylesheetId).toBe("\0pandwind:migration:/virtual/project/src/Card.module.css");
		expect(stylesheet).toContain(".root { color: red; padding: 1rem; }");
		expect(stylesheet).toContain(sourceMapReference("Card.module.css.map"));
		expect(stylesheetMapId).toBe("\0pandwind:migration:/virtual/project/src/Card.module.css.map");
		expect(stylesheetMap).toContain('"sources":["Card.tsx"]');
		expect(stylesheetMap).toContain(JSON.stringify(source));
		expect(stylesheetMap).not.toContain('"mappings":""');
		expect(residuals).toEqual([]);
		expect([...files.entries()]).toEqual([[sourceFile, source]]);
		expect(serializedMap).toContain(`"sources":["${sourceFile}"]`);
		expect(serializedMap).toContain(JSON.stringify(source));
		expect(serializedMap).not.toContain('"mappings":""');
		expect(transformed?.code).toContain('export const unchanged = "preserved";');
	});

	test("native platform slices are generated by the same factory", () => {
		expect({
			webpack: typeof pandwindMigrateWebpack(options).apply,
			rspack: typeof pandwindMigrateRspack(options).apply,
			rsbuild: typeof pandwindMigrateRsbuild(options).setup,
			esbuild: typeof pandwindMigrateEsbuild(options).setup,
			farm: typeof pandwindMigrateFarm(options),
			bun: typeof pandwindMigrateBun,
		}).toMatchInlineSnapshot(`
			{
			  "bun": "function",
			  "esbuild": "function",
			  "farm": "object",
			  "rsbuild": "function",
			  "rspack": "function",
			  "webpack": "function",
			}
		`);
	});
});
