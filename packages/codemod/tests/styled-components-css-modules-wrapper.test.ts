import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "vitest";
import { runAdapterMigration } from "../src/swap/adapter-migration.ts";
import {
	BuiltinHostFramework,
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	type AdapterGeneratedFile,
} from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();
const root = "/virtual/css-modules-project";
const sourceMapReferencePrefix = ["sourceMapping", "URL="].join("");
const sourceMapReference = (path: string) => `${sourceMapReferencePrefix}${path}`;

const generatedFilesForSnapshot = (files: readonly AdapterGeneratedFile[]) =>
	files.map((file) => ({
		...file,
		content: file.content.replace(sourceMapReferencePrefix, "mapReference="),
	}));

const stylesheetForSnapshot = (stylesheet: string | undefined) =>
	stylesheet?.replace(sourceMapReferencePrefix, "mapReference=") ?? null;

const migrate = (source: string, file = "src/Card.tsx") =>
	runAdapterMigration(source, {
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.CssModules,
		file,
		root,
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

const typecheckGeneratedProject = (
	componentSource: string,
	componentTag: "button" | "div" | "a" = "div",
	consumerAttributes = "",
): string => {
	const projectRoot = resolve(process.cwd(), "../../benchmarks/styling-tsc");
	const directory = mkdtempSync(join(projectRoot, ".codemod-css-modules-"));
	const componentFile = join(directory, "Card.tsx");
	const consumerFile = join(directory, "App.tsx");
	const secondConsumerFile = join(directory, "CardPreview.tsx");
	const declarationsFile = join(directory, "css-modules.d.ts");
	const configFile = join(directory, "tsconfig.json");
	try {
		writeFileSync(componentFile, componentSource);
		writeFileSync(
			consumerFile,
			'import { createRef } from "react";\n' +
				'import { Card } from "./Card";\n' +
				`const cardRef = createRef<HTML${componentTag === "button" ? "Button" : componentTag === "a" ? "Anchor" : "Div"}Element>();\n` +
				`export const App = () => <Card title="Reusable" className="consumer-class" style={{ display: "block" }} ref={cardRef} ${consumerAttributes}>content</Card>;`,
		);
		writeFileSync(
			secondConsumerFile,
			'import { Card } from "./components";\n' +
				'export const CardPreview = () => <Card aria-label="Preview">preview</Card>;',
		);
		writeFileSync(join(directory, "components.ts"), 'export { Card } from "./Card";');
		writeFileSync(
			declarationsFile,
			'declare module "*.module.css" { const classes: Readonly<Record<string, string>>; export default classes; }',
		);
		writeFileSync(
			configFile,
			JSON.stringify(
				{
					compilerOptions: {
						jsx: "react-jsx",
						module: "ESNext",
						moduleResolution: "Bundler",
						noEmit: true,
						skipLibCheck: true,
						strict: true,
						target: "ESNext",
					},
					files: [
						componentFile,
						consumerFile,
						secondConsumerFile,
						join(directory, "components.ts"),
						declarationsFile,
					],
				},
				null,
				2,
			),
		);
		try {
			return execFileSync("pnpm", ["exec", "tsc", "--project", configFile], {
				cwd: projectRoot,
				encoding: "utf8",
			});
		} catch (error) {
			if (error instanceof Error && "stdout" in error && "stderr" in error)
				throw new Error(`${String(error.stdout)}${String(error.stderr)}`, { cause: error });
			throw error;
		}
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

const typecheckYumCSSProject = (
	componentSource: string,
	generatedFiles: readonly AdapterGeneratedFile[],
): string => {
	const projectRoot = resolve(process.cwd(), "../../benchmarks/styling-tsc");
	const directory = mkdtempSync(join(projectRoot, ".codemod-yumcss-component-"));
	const sourceDirectory = join(directory, "src");
	const componentFile = join(sourceDirectory, "Card.tsx");
	const consumerFile = join(sourceDirectory, "App.tsx");
	const configFile = join(directory, "tsconfig.json");
	try {
		mkdirSync(sourceDirectory, { recursive: true });
		writeFileSync(componentFile, componentSource);
		writeFileSync(
			consumerFile,
			'import { createRef } from "react";\n' +
				'import { Card } from "./Card";\n' +
				"const divRef = createRef<HTMLDivElement>();\n" +
				"const anchorRef = createRef<HTMLAnchorElement>();\n" +
				"export const App = () => <>\n" +
				'<Card ref={divRef} title="Card" $tone="cool">Card</Card>\n' +
				'<Card as="a" href="/card" ref={anchorRef}>Link</Card>\n' +
				"</>;\n",
		);
		for (const generatedFile of generatedFiles) {
			const generatedPath = join(directory, generatedFile.path);
			mkdirSync(dirname(generatedPath), { recursive: true });
			writeFileSync(generatedPath, generatedFile.content);
		}
		writeFileSync(
			configFile,
			JSON.stringify(
				{
					compilerOptions: {
						jsx: "react-jsx",
						module: "ESNext",
						moduleResolution: "Bundler",
						noEmit: true,
						skipLibCheck: true,
						strict: true,
						target: "ESNext",
					},
					include: ["src/**/*.tsx", "__yumcss/**/*.tsx"],
				},
				null,
				2,
			),
		);
		try {
			return execFileSync("pnpm", ["exec", "tsc", "--project", configFile], {
				cwd: projectRoot,
				encoding: "utf8",
			});
		} catch (error) {
			if (error instanceof Error && "stdout" in error && "stderr" in error)
				throw new Error(`${String(error.stdout)}${String(error.stderr)}`, { cause: error });
			throw error;
		}
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

const renderGeneratedProject = (
	componentSource: string,
	stylesheet: string,
	consumerAttributes = "",
	generatedFiles: readonly AdapterGeneratedFile[] = [],
	additionalConsumer = "",
): string => {
	const projectRoot = resolve(process.cwd(), "../../examples/showcase");
	const directory = mkdtempSync(join(projectRoot, ".codemod-css-modules-ssr-"));
	const sourceDirectory = join(directory, "src");
	const rendererFile = join(directory, "render.mjs");
	try {
		mkdirSync(sourceDirectory);
		writeFileSync(join(sourceDirectory, "Card.tsx"), componentSource);
		writeFileSync(join(sourceDirectory, "Card.module.css"), stylesheet);
		for (const generatedFile of generatedFiles) {
			const generatedPath = join(directory, generatedFile.path);
			mkdirSync(dirname(generatedPath), { recursive: true });
			writeFileSync(generatedPath, generatedFile.content);
		}
		writeFileSync(
			join(sourceDirectory, "App.tsx"),
			'import { createRef } from "react";\n' +
				'import { Card } from "./Card";\n' +
				"const cardRef = createRef();\n" +
				"export const App = () => <>\n" +
				`<Card title="Reusable" className="consumer-class" style={{ display: "block" }} $tone="private" ref={cardRef} ${consumerAttributes}>content</Card>\n` +
				`${additionalConsumer}\n` +
				"</>;\n",
		);
		writeFileSync(
			rendererFile,
			`import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const projectRoot = process.argv[2];
const vite = await createServer({
	appType: "custom",
	configFile: false,
	logLevel: "silent",
	root: projectRoot,
	server: { middlewareMode: true },
});

try {
	const { App } = await vite.ssrLoadModule("/src/App.tsx");
	console.log(JSON.stringify(renderToStaticMarkup(createElement(App))));
} finally {
	await vite.close();
}`,
		);
		try {
			return execFileSync("pnpm", ["exec", "node", rendererFile, directory], {
				cwd: projectRoot,
				encoding: "utf8",
			}).trim();
		} catch (error) {
			if (error instanceof Error && "stdout" in error && "stderr" in error)
				throw new Error(`${String(error.stdout)}${String(error.stderr)}`, { cause: error });
			throw error;
		}
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

test("styled-components -> YumCSS keeps a reusable polymorphic component and typed refs", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div.attrs({ title: "Styled", $tone: "base" })({ color: "red", padding: "1rem" });';
	const result = runAdapterMigration(source, {
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.YumCSS,
		file: "/project/src/Card.tsx",
		root: "/project",
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

	expect(result.residuals).toEqual([]);
	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('from "../__yumcss/slot"');
	expect(result.generatedFiles).toHaveLength(1);
	expect(result.generatedFiles[0]?.path).toBe("__yumcss/slot.tsx");
	expect(result.generatedFiles[0]?.content).toContain(
		"forwardRef<unknown, YumCSSSlotRuntimeProps>",
	);
	expect(result.generatedFiles[0]?.content).toContain(
		"YumCSSSlotComponent<DefaultComponent, Prefix>",
	);
	expect(result.generatedFiles[0]?.content).toContain("createElement(Component");
	expect(result.generatedFiles[0]?.content).toContain("filteredPropPrefixes.some");
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "yumcss/unsafe/css";
		import { createCx } from "yumcss/cx";
		import { __yumcssSlot } from "../__yumcss/slot";
		const cx = createCx();
		const css = createUnsafeCss();
		export const Card = __yumcssSlot({ defaultComponent: "div", style: css.class({ color: "red", padding: "1rem" }), stableClass: "pw-1vtnp7w", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: ["$"], attrs: ({ title: "Styled", $tone: "base" }), joinClass: cx });"
	`);
	expect(result.generatedFiles[0]?.content).toMatchInlineSnapshot(`
		"import { createElement, forwardRef } from "react";
		import type { ComponentPropsWithoutRef, ComponentRef, CSSProperties, ElementType, ReactElement, Ref } from "react";

		type YumCSSSlotTransientProps<Prefix extends string> = {
			readonly [key in \`\${Prefix}\${string}\`]?: unknown;
		};
		type YumCSSSlotProps<Component extends ElementType, Prefix extends string> = Omit<ComponentPropsWithoutRef<Component>, "as" | "className"> & YumCSSSlotTransientProps<Prefix> & {
			readonly as?: Component;
			readonly className?: string;
			readonly ref?: Ref<ComponentRef<Component>>;
		};
		type YumCSSSlotComponent<DefaultComponent extends ElementType, Prefix extends string> = <Component extends ElementType = DefaultComponent>(
			props: YumCSSSlotProps<Component, Prefix>,
		) => ReactElement | null;
		type YumCSSSlotRuntimeProps = Record<string, unknown> & {
			readonly as?: ElementType;
			readonly className?: string;
			readonly style?: CSSProperties;
		};
		type YumCSSSlotOptions<DefaultComponent extends ElementType, Prefix extends string> = {
			readonly defaultComponent: DefaultComponent;
			readonly style: string;
			readonly stableClass: string;
			readonly inheritedClass?: string;
			readonly classAttribute: string;
			readonly filteredPropPrefixes: readonly Prefix[];
			readonly attrs: Readonly<Record<string, unknown>> & {
				readonly as?: ElementType;
				readonly className?: string;
				readonly style?: CSSProperties;
			};
			readonly joinClass: (...values: (string | undefined)[]) => string;
		};
		const isYumCSSSlotElementType = (value: unknown): value is ElementType =>
			typeof value === "string" ||
			typeof value === "function" ||
			typeof value === "symbol" ||
			(typeof value === "object" && value !== null);

		export const __yumcssSlot = <DefaultComponent extends ElementType, Prefix extends string = never>({
			defaultComponent,
			style,
			stableClass,
			inheritedClass,
			classAttribute,
			filteredPropPrefixes,
			attrs,
			joinClass,
		}: YumCSSSlotOptions<DefaultComponent, Prefix>) => {
			const component = forwardRef<unknown, YumCSSSlotRuntimeProps>((props, ref) => {
				const Component = isYumCSSSlotElementType(props.as) ? props.as : defaultComponent;
				const { as: _as, ...rest } = props;
				const { as: _attrsAs, ...attrsProps } = attrs;
				const forwarded =
					filteredPropPrefixes.length === 0
						? { ...rest, ...attrsProps }
						: Object.fromEntries(
								[...Object.entries(rest), ...Object.entries(attrsProps)].filter(
									([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)),
								),
							);
				const attrsClassName = typeof attrs.className === "string" ? attrs.className : undefined;
				const propsClassName = typeof props.className === "string" ? props.className : undefined;
				return createElement(Component, {
					...forwarded,
					ref,
					[classAttribute]: joinClass(
						style,
						stableClass,
						inheritedClass,
						attrsClassName,
						propsClassName,
					),
				});
			});
			return Object.assign(component as unknown as YumCSSSlotComponent<DefaultComponent, Prefix>, {
				__yumcssClassName: stableClass,
			});
		};
		"
	`);
	expect(typecheckYumCSSProject(result.code, result.generatedFiles)).toBe("");
	const html = JSON.parse(
		renderGeneratedProject(
			result.code,
			"",
			"",
			result.generatedFiles,
			'<Card as="a" href="/card" ref={cardRef}>Link</Card>',
		),
	);
	expect(html).toContain('<div title="Styled"');
	expect(html).not.toContain("$tone");
	expect(html).toContain('<a href="/card"');
	expect(html).toContain(">Link</a>");
});

test("styled-components -> YumCSS preserves callback attrs with a typed residual", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div.attrs((props) => ({ title: props.title }))({ color: "red" });';
	const result = runAdapterMigration(source, {
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.YumCSS,
		file: "/project/src/Card.tsx",
		root: "/project",
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

	expect(result.converted).toBe(0);
	expect(result.skipped).toBe(1);
	expect(result.code).toContain(source.slice(source.indexOf("export const Card")));
	expect(result.residuals).toEqual([
		expect.objectContaining({
			kind: "host-framework",
			hint: "YumCSS preserves callback or non-object attrs until their returned host props can be verified",
		}),
	]);
	expect(result.code).toMatchInlineSnapshot(`
		"import styled from "styled-components";
		// yumcss:migrate-skip (route: styled-components -> yumcss | lowering-residual: host-framework | available: static, named-map, residual)
		export const Card = styled.div.attrs((props) => ({ title: props.title }))({ color: "red" });"
	`);
});

test("styled-components -> YumCSS preserves attrs-selected hosts as a typed residual", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div.attrs({ as: "a" })({ color: "red" });';
	const result = runAdapterMigration(source, {
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.YumCSS,
		file: "/project/src/Card.tsx",
		root: "/project",
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

	expect(result.converted).toBe(0);
	expect(result.skipped).toBe(1);
	expect(result.code).toContain('styled.div.attrs({ as: "a" })');
	expect(result.residuals).toEqual([
		expect.objectContaining({
			kind: "host-framework",
			hint: "YumCSS preserves attrs-selected hosts until the concrete host and its ref type can be verified",
		}),
	]);
	expect(result.code).toMatchInlineSnapshot(`
		"import styled from "styled-components";
		// yumcss:migrate-skip (route: styled-components -> yumcss | lowering-residual: host-framework | available: static, named-map, residual)
		export const Card = styled.div.attrs({ as: "a" })({ color: "red" });"
	`);
});

test("styled-components transient props stay filtered in a Tailwind class wrapper", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div.attrs({ title: "Styled" })({ color: "red" });\n' +
		'export const App = () => <Card $tone="cool">Card</Card>;';
	const result = runAdapterMigration(source, {
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.Tailwind,
		file: "/project/src/Card.tsx",
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain("key.startsWith(prefix)");
	expect(result.code).toContain("ref={ref}");
	expect(result.code).toMatchInlineSnapshot(`
		"import { forwardRef as __yumcssCardForwardRef } from "react";
		import type { ComponentPropsWithoutRef as __yumcssCardPropsWithoutRef, ComponentRef as __yumcssCardRef, ElementType as __yumcssCardElementType, ReactElement as __yumcssCardReactElement, Ref as __yumcssCardRefProp } from "react";
		export const Card = (() => { type __yumcssCardProps<C extends __yumcssCardElementType> = Omit<__yumcssCardPropsWithoutRef<C>, "as" | "forwardedAs" | "className" | "style"> & { as?: C; forwardedAs?: C; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __yumcssCardComponent = <C extends __yumcssCardElementType = "div">(props: __yumcssCardProps<C> & { ref?: __yumcssCardRefProp<__yumcssCardRef<C>> }) => __yumcssCardReactElement | null; type __yumcssCardRuntimeProps = Record<string, any>; return __yumcssCardForwardRef<__yumcssCardRef<"div">, __yumcssCardRuntimeProps>((props, ref) => { const attrs: Record<string, any> = ({ title: "Styled" }); const { as: _attrsAs, forwardedAs: _attrsForwardedAs, ...attrsProps } = attrs; const Component = attrs.as ?? props.as ?? attrs.forwardedAs ?? props.forwardedAs ?? "div"; const { as: _as, forwardedAs: _forwardedAs, ...rest } = props; return <Component {...Object.fromEntries(Object.entries({ ...rest, ...attrsProps }).filter(([key]) => !["$"].some((prefix) => key.startsWith(prefix))))} ref={ref} className={["[color:red]", [attrs.className, props.className].filter(Boolean).join(" ")].filter(Boolean).join(" ")} style={{ ...props.style, ...attrs.style }} />; }) as __yumcssCardComponent; })();
		export const App = () => <Card $tone="cool">Card</Card>;"
	`);
	const html = JSON.parse(renderGeneratedProject(result.code, ""));
	expect(html).toContain('class="[color:red] consumer-class"');
	expect(html).toContain('title="Styled"');
	expect(html).not.toContain("$tone");
	expect(html).toContain(">content</div>");
	expect(typecheckGeneratedProject(result.code)).toBe("");
	expect(typecheckGeneratedProject(result.code, "a", 'as="a" href="/card"')).toBe("");
	const rerun = runAdapterMigration(result.code, {
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.Tailwind,
		file: "/project/src/Card.tsx",
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});
	expect(rerun.changed).toBe(false);
});

test("styled-components -> CSS Modules keeps a reusable React component export", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ color: "red", padding: "1rem" });';
	const result = migrate(source);

	expect({
		code: result.code,
		converted: result.converted,
		generatedFiles: generatedFilesForSnapshot(result.generatedFiles),
		residuals: result.residuals,
	}).toMatchInlineSnapshot(`
		{
		  "code": "import __yumcssCardStyles from "./Card.module.css";
		import { createElement as __yumcssCardCreateElement, forwardRef as __yumcssCardForwardRef } from "react";
		import type { ComponentRef as __yumcssCardComponentRef, ComponentPropsWithoutRef as __yumcssCardComponentProps } from "react";
		export const Card = (() => { type __yumcssCardProps<As extends import("react").ElementType> = Omit<__yumcssCardComponentProps<As>, "as" | "forwardedAs" | "className" | "style"> & { as?: As; forwardedAs?: As; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __yumcssCardPolymorphicComponent = <As extends import("react").ElementType = "div">(props: __yumcssCardProps<As> & { ref?: import("react").Ref<__yumcssCardComponentRef<As>> }) => import("react").ReactElement | null; type __yumcssCardInternalProps = { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly forwardedAs?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; return __yumcssCardForwardRef<unknown, __yumcssCardInternalProps>((props, ref) => { const { as: propsAs, forwardedAs: propsForwardedAs, className, style, ...rest } = props; const attrs: { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } = ({}); const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const Component = (attrsAs ?? propsAs ?? propsForwardedAs ?? "div") as import("react").ElementType; return __yumcssCardCreateElement(Component, { ...Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))), ref, className: [__yumcssCardStyles.root, attrsClassName, className].filter(Boolean).join(" "), style: Object.assign({}, style, attrsStyle) } as import("react").ComponentPropsWithRef<import("react").ElementType>); }) as __yumcssCardPolymorphicComponent; })();",
		  "converted": 1,
		  "generatedFiles": [
		    {
		      "content": ".root { color: red; padding: 1rem; }
		/*# mapReference=Card.module.css.map */
		",
		      "path": "src/Card.module.css",
		      "purpose": "CSS Modules styles for a migrated React component",
		    },
		    {
		      "content": "{"version":3,"file":"Card.module.css","sources":["Card.tsx"],"sourcesContent":["import styled from \\"styled-components\\";\\nexport const Card = styled.div({ color: \\"red\\", padding: \\"1rem\\" });"],"names":[],"mappings":"AACoB;AAAA;"}",
		      "path": "src/Card.module.css.map",
		      "purpose": "CSS Modules source map for a migrated React component",
		    },
		  ],
		  "residuals": [],
		}
	`);
	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain("export const Card = (() => { type __yumcssCardProps<As extends");
	expect(result.code).toContain('import __yumcssCardStyles from "./Card.module.css";');
	expect(result.code).toContain("__yumcssCardComponentProps<As>");
	expect(result.code).toContain("as?: As");
	expect(result.code).toContain("ref");
	expect(result.generatedFiles).toHaveLength(2);
	expect(result.generatedFiles[0]).toMatchObject({ path: "src/Card.module.css" });
	expect(result.generatedFiles[0]?.content).toContain(".root {");
	expect(result.generatedFiles[0]?.content).toContain("padding: 1rem;");
	expect(result.generatedFiles[0]?.content).toContain(sourceMapReference("Card.module.css.map"));
	expect(result.generatedFiles[1]).toMatchObject({ path: "src/Card.module.css.map" });
	expect(result.generatedFiles[1]?.content).toContain('"sources":["Card.tsx"]');
	expect(result.generatedFiles[1]?.content).toContain(JSON.stringify(source));
	expect(result.generatedFiles[1]?.content).not.toContain('"mappings":""');
	expect(result.code).not.toContain("styled-components");
	expect(typecheckGeneratedProject(result.code)).toBe("");
	const stylesheet = result.generatedFiles[0]?.content ?? "";
	const html = JSON.parse(
		renderGeneratedProject(result.code, stylesheet, "", result.generatedFiles),
	);
	expect(html).toContain('title="Reusable"');
	expect(html).toMatch(/class="[^"]+ consumer-class"/u);
	expect(html).toContain('style="display:block"');
	expect(html).not.toContain("$tone");
	expect(html).toContain(">content</div>");
	const rerun = migrate(result.code);
	expect(rerun.changed).toBe(false);
	expect(rerun.generatedFiles).toEqual([]);
});

test("styled-components -> CSS Modules preserves literal DOM attrs and their precedence", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.button.attrs({ type: "button", "aria-label": "Saved", $tone: "base" })({ color: "red" });';
	const result = migrate(source);

	expect({
		code: result.code,
		converted: result.converted,
		generatedFiles: generatedFilesForSnapshot(result.generatedFiles),
		residuals: result.residuals,
	}).toMatchInlineSnapshot(`
		{
		  "code": "import __yumcssCardStyles from "./Card.module.css";
		import { createElement as __yumcssCardCreateElement, forwardRef as __yumcssCardForwardRef } from "react";
		import type { ComponentRef as __yumcssCardComponentRef, ComponentPropsWithoutRef as __yumcssCardComponentProps } from "react";
		export const Card = (() => { type __yumcssCardProps<As extends import("react").ElementType> = Omit<__yumcssCardComponentProps<As>, "as" | "forwardedAs" | "className" | "style"> & { as?: As; forwardedAs?: As; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __yumcssCardPolymorphicComponent = <As extends import("react").ElementType = "button">(props: __yumcssCardProps<As> & { ref?: import("react").Ref<__yumcssCardComponentRef<As>> }) => import("react").ReactElement | null; type __yumcssCardInternalProps = { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly forwardedAs?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; return __yumcssCardForwardRef<unknown, __yumcssCardInternalProps>((props, ref) => { const { as: propsAs, forwardedAs: propsForwardedAs, className, style, ...rest } = props; const attrs: { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } = ({ type: "button", "aria-label": "Saved", $tone: "base" }); const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const Component = (attrsAs ?? propsAs ?? propsForwardedAs ?? "button") as import("react").ElementType; return __yumcssCardCreateElement(Component, { ...Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))), ref, className: [__yumcssCardStyles.root, attrsClassName, className].filter(Boolean).join(" "), style: Object.assign({}, style, attrsStyle) } as import("react").ComponentPropsWithRef<import("react").ElementType>); }) as __yumcssCardPolymorphicComponent; })();",
		  "converted": 1,
		  "generatedFiles": [
		    {
		      "content": ".root { color: red; }
		/*# mapReference=Card.module.css.map */
		",
		      "path": "src/Card.module.css",
		      "purpose": "CSS Modules styles for a migrated React component",
		    },
		    {
		      "content": "{"version":3,"file":"Card.module.css","sources":["Card.tsx"],"sourcesContent":["import styled from \\"styled-components\\";\\nexport const Card = styled.button.attrs({ type: \\"button\\", \\"aria-label\\": \\"Saved\\", $tone: \\"base\\" })({ color: \\"red\\" });"],"names":[],"mappings":"AACoB;AAAA;"}",
		      "path": "src/Card.module.css.map",
		      "purpose": "CSS Modules source map for a migrated React component",
		    },
		  ],
		  "residuals": [],
		}
	`);
	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('$tone: "base"');
	expect(result.code).toContain('!key.startsWith("$")');
	expect(result.code).toContain('import __yumcssCardStyles from "./Card.module.css";');
	expect(result.generatedFiles).toHaveLength(2);
	expect(result.generatedFiles[0]?.content).toContain(".root { color: red; }");
	expect(
		typecheckGeneratedProject(
			result.code,
			"button",
			'type="submit" aria-label="Caller" $tone="private"',
		),
	).toBe("");
	const html = JSON.parse(
		renderGeneratedProject(
			result.code,
			result.generatedFiles[0]?.content ?? "",
			'type="submit" aria-label="Caller"',
			result.generatedFiles,
		),
	);
	expect(html).toContain("<button");
	expect(html).toContain('type="button"');
	expect(html).toContain('aria-label="Saved"');
	expect(html).not.toContain("$tone");
	expect(html).not.toContain('type="submit"');
	expect(html).not.toContain('aria-label="Caller"');
});

test("styled-components -> CSS Modules preserves dynamic component styles as a residual", () => {
	const source =
		'import styled from "styled-components";\n' +
		"export const Card = styled.div({ color: (props) => props.color });";
	const result = migrate(source);

	expect(result.converted).toBe(0);
	expect(result.skipped).toBeGreaterThan(0);
	expect(result.generatedFiles).toEqual([]);
	expect(result.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: "capability",
				hint: expect.stringContaining("dynamic values need"),
			}),
		]),
	);
	expect(result.code).toContain(
		"export const Card = styled.div({ color: (props) => props.color });",
	);
	expect(result.code).toContain("yumcss:migrate-skip");
	expect({ converted: result.converted, residuals: result.residuals }).toMatchInlineSnapshot(`
		{
		  "converted": 0,
		  "residuals": [
		    {
		      "hint": "function-values: dynamic: (props) => props.color",
		      "kind": "capability",
		      "text": "styled.div({ color: (props) => props.color })",
		    },
		    {
		      "hint": "dynamic values need a target runtime or verified CSS variable carrier",
		      "kind": "capability",
		      "text": "styled.div",
		    },
		  ],
		}
	`);
});

test("styled-components -> CSS Modules converts polymorphic hosts and literal attrs", () => {
	const polymorphicSource =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ color: "red" });\n' +
		'export const App = () => <Card as="a" href="/">link</Card>;';
	const attrsSource =
		'import styled from "styled-components";\n' +
		'export const Card = styled.button.attrs({ className: "attrs-class", name: "saved", style: { color: "red" } })({ color: "red" });';
	const dynamicAttrsSource =
		'import styled from "styled-components";\n' +
		'export const Card = styled.button.attrs({ title: getTitle() })({ color: "red" });';
	const typeScriptSource =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ color: "red" });';
	const polymorphic = migrate(polymorphicSource);
	const attrs = migrate(attrsSource);
	const jsx = migrate(polymorphicSource, "src/Card.jsx");
	const dynamicAttrs = migrate(dynamicAttrsSource);
	const typeScript = migrate(typeScriptSource, "src/Card.ts");
	expect(polymorphic.converted).toBe(1);
	expect(polymorphic.skipped).toBe(0);
	expect(polymorphic.residuals).toEqual([]);
	expect(polymorphic.generatedFiles.map(({ path }) => path)).toEqual([
		"src/Card.module.css",
		"src/Card.module.css.map",
	]);
	expect(polymorphic.code).toContain('export const App = () => <Card as="a" href="/">link</Card>;');
	expect(polymorphic.code).not.toContain('<div as="a"');
	expect(typecheckGeneratedProject(polymorphic.code, "a", 'as="a" href="/"')).toBe("");
	const polymorphicHtml = JSON.parse(
		renderGeneratedProject(
			polymorphic.code,
			polymorphic.generatedFiles[0]?.content ?? "",
			'as="a" href="/"',
			polymorphic.generatedFiles,
		),
	) as string;
	expect(polymorphicHtml).toMatch(/^<a\b/u);
	expect(polymorphicHtml).toContain('href="/"');
	expect(polymorphicHtml).not.toContain(' as="a"');
	expect(attrs.converted).toBe(1);
	expect(attrs.skipped).toBe(0);
	expect(attrs.residuals).toEqual([]);
	expect(attrs.code).toContain('name: "saved"');
	expect(typecheckGeneratedProject(attrs.code, "button", 'name="caller"')).toBe("");
	const attrsHtml = JSON.parse(
		renderGeneratedProject(
			attrs.code,
			attrs.generatedFiles[0]?.content ?? "",
			'name="caller"',
			attrs.generatedFiles,
		),
	) as string;
	expect(attrsHtml).toContain('name="saved"');
	expect(attrsHtml).toContain('class="');
	expect(attrsHtml).toContain("attrs-class");
	expect(attrsHtml).toContain("consumer-class");
	expect(attrsHtml).toContain('style="display:block;color:red"');
	expect(dynamicAttrs.converted).toBe(0);
	expect(dynamicAttrs.generatedFiles).toEqual([]);
	expect(dynamicAttrs.code).toContain("yumcss:migrate-skip");
	expect(dynamicAttrs.code).toContain("getTitle()");
	expect(dynamicAttrs.residuals.length).toBeGreaterThan(0);
	expect(jsx.converted).toBe(1);
	expect(jsx.residuals).toEqual([]);
	expect(jsx.code).not.toContain("import type { ComponentRef");
	const jsxHtml = JSON.parse(
		renderGeneratedProject(
			jsx.code,
			jsx.generatedFiles[0]?.content ?? "",
			'as="a" href="/"',
			jsx.generatedFiles,
		),
	) as string;
	expect(jsxHtml).toMatch(/^<a\b/u);
	expect(jsxHtml).toContain('href="/"');
	expect(typeScript.converted).toBe(1);
	expect(typeScript.residuals).toEqual([]);
	expect(typeScript.code).toContain("import type { ComponentRef as");
	expect(typecheckGeneratedProject(typeScript.code, "a", 'as="a" href="/"')).toBe("");
	const typeScriptHtml = JSON.parse(
		renderGeneratedProject(
			typeScript.code,
			typeScript.generatedFiles[0]?.content ?? "",
			'as="a" href="/"',
			typeScript.generatedFiles,
		),
	) as string;
	expect(typeScriptHtml).toMatch(/^<a\b/u);
	expect(typeScriptHtml).toContain('href="/"');
	expect({
		polymorphic: {
			code: polymorphic.code,
			generatedFiles: generatedFilesForSnapshot(polymorphic.generatedFiles),
			residuals: polymorphic.residuals,
		},
		attrs: {
			code: attrs.code,
			generatedFiles: generatedFilesForSnapshot(attrs.generatedFiles),
			residuals: attrs.residuals,
			html: attrsHtml,
		},
		dynamicAttrs: dynamicAttrs.residuals,
		jsx: { converted: jsx.converted, residuals: jsx.residuals, html: jsxHtml },
		typeScript: {
			converted: typeScript.converted,
			residuals: typeScript.residuals,
			html: typeScriptHtml,
		},
	}).toMatchInlineSnapshot(`
		{
		  "attrs": {
		    "code": "import __yumcssCardStyles from "./Card.module.css";
		import { createElement as __yumcssCardCreateElement, forwardRef as __yumcssCardForwardRef } from "react";
		import type { ComponentRef as __yumcssCardComponentRef, ComponentPropsWithoutRef as __yumcssCardComponentProps } from "react";
		export const Card = (() => { type __yumcssCardProps<As extends import("react").ElementType> = Omit<__yumcssCardComponentProps<As>, "as" | "forwardedAs" | "className" | "style"> & { as?: As; forwardedAs?: As; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __yumcssCardPolymorphicComponent = <As extends import("react").ElementType = "button">(props: __yumcssCardProps<As> & { ref?: import("react").Ref<__yumcssCardComponentRef<As>> }) => import("react").ReactElement | null; type __yumcssCardInternalProps = { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly forwardedAs?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; return __yumcssCardForwardRef<unknown, __yumcssCardInternalProps>((props, ref) => { const { as: propsAs, forwardedAs: propsForwardedAs, className, style, ...rest } = props; const attrs: { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } = ({ className: "attrs-class", name: "saved", style: { color: "red" } }); const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const Component = (attrsAs ?? propsAs ?? propsForwardedAs ?? "button") as import("react").ElementType; return __yumcssCardCreateElement(Component, { ...Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))), ref, className: [__yumcssCardStyles.root, attrsClassName, className].filter(Boolean).join(" "), style: Object.assign({}, style, attrsStyle) } as import("react").ComponentPropsWithRef<import("react").ElementType>); }) as __yumcssCardPolymorphicComponent; })();",
		    "generatedFiles": [
		      {
		        "content": ".root { color: red; }
		/*# mapReference=Card.module.css.map */
		",
		        "path": "src/Card.module.css",
		        "purpose": "CSS Modules styles for a migrated React component",
		      },
		      {
		        "content": "{"version":3,"file":"Card.module.css","sources":["Card.tsx"],"sourcesContent":["import styled from \\"styled-components\\";\\nexport const Card = styled.button.attrs({ className: \\"attrs-class\\", name: \\"saved\\", style: { color: \\"red\\" } })({ color: \\"red\\" });"],"names":[],"mappings":"AACoB;AAAA;"}",
		        "path": "src/Card.module.css.map",
		        "purpose": "CSS Modules source map for a migrated React component",
		      },
		    ],
		    "html": "<button title="Reusable" class="_root_z7q9n_1 attrs-class consumer-class" style="display:block;color:red" name="saved">content</button>",
		    "residuals": [],
		  },
		  "dynamicAttrs": [
		    {
		      "hint": "attrs must be a literal object with static values and supported as, className, and style values",
		      "kind": "capability",
		      "text": "Card",
		    },
		  ],
		  "jsx": {
		    "converted": 1,
		    "html": "<a title="Reusable" href="/" class="_root_z7q9n_1 consumer-class" style="display:block">content</a>",
		    "residuals": [],
		  },
		  "polymorphic": {
		    "code": "import __yumcssCardStyles from "./Card.module.css";
		import { createElement as __yumcssCardCreateElement, forwardRef as __yumcssCardForwardRef } from "react";
		import type { ComponentRef as __yumcssCardComponentRef, ComponentPropsWithoutRef as __yumcssCardComponentProps } from "react";
		export const Card = (() => { type __yumcssCardProps<As extends import("react").ElementType> = Omit<__yumcssCardComponentProps<As>, "as" | "forwardedAs" | "className" | "style"> & { as?: As; forwardedAs?: As; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __yumcssCardPolymorphicComponent = <As extends import("react").ElementType = "div">(props: __yumcssCardProps<As> & { ref?: import("react").Ref<__yumcssCardComponentRef<As>> }) => import("react").ReactElement | null; type __yumcssCardInternalProps = { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly forwardedAs?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; return __yumcssCardForwardRef<unknown, __yumcssCardInternalProps>((props, ref) => { const { as: propsAs, forwardedAs: propsForwardedAs, className, style, ...rest } = props; const attrs: { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } = ({}); const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const Component = (attrsAs ?? propsAs ?? propsForwardedAs ?? "div") as import("react").ElementType; return __yumcssCardCreateElement(Component, { ...Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))), ref, className: [__yumcssCardStyles.root, attrsClassName, className].filter(Boolean).join(" "), style: Object.assign({}, style, attrsStyle) } as import("react").ComponentPropsWithRef<import("react").ElementType>); }) as __yumcssCardPolymorphicComponent; })();
		export const App = () => <Card as="a" href="/">link</Card>;",
		    "generatedFiles": [
		      {
		        "content": ".root { color: red; }
		/*# mapReference=Card.module.css.map */
		",
		        "path": "src/Card.module.css",
		        "purpose": "CSS Modules styles for a migrated React component",
		      },
		      {
		        "content": "{"version":3,"file":"Card.module.css","sources":["Card.tsx"],"sourcesContent":["import styled from \\"styled-components\\";\\nexport const Card = styled.div({ color: \\"red\\" });\\nexport const App = () => <Card as=\\"a\\" href=\\"/\\">link</Card>;"],"names":[],"mappings":"AACoB;AAAA;"}",
		        "path": "src/Card.module.css.map",
		        "purpose": "CSS Modules source map for a migrated React component",
		      },
		    ],
		    "residuals": [],
		  },
		  "typeScript": {
		    "converted": 1,
		    "html": "<a title="Reusable" href="/" class="_root_z7q9n_1 consumer-class" style="display:block">content</a>",
		    "residuals": [],
		  },
		}
	`);
});

test("styled-components -> CSS Modules preserves a component in a malformed source file", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ color: "red" });\n' +
		"const unfinished = { /* unfinished component file */";
	const result = migrate(source);

	expect(result.converted).toBe(0);
	expect(result.generatedFiles).toEqual([]);
	expect(result.code).toContain('export const Card = styled.div({ color: "red" });');
	expect(result.code).toContain("unfinished component file");
	expect(result.code).not.toContain("__yumcssCardForwardRef");
	expect(result.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: "capability",
				hint: "the source file contains parse errors",
			}),
		]),
	);
	expect({ converted: result.converted, residuals: result.residuals }).toMatchInlineSnapshot(`
		{
		  "converted": 0,
		  "residuals": [
		    {
		      "hint": "the source file contains parse errors",
		      "kind": "capability",
		      "text": "Card",
		    },
		  ],
		}
	`);
});

test("styled-components -> CSS Modules preserves source numeric unit semantics", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ padding: 8, margin: 0, opacity: 0.5, lineHeight: 1.25, fontWeight: 700, zIndex: 2, "--custom": 3, boxFlex: 1, boxFlexGroup: 1, boxOrdinalGroup: 1, flexPositive: 1, flexNegative: 1, flexOrder: 1, msGridRow: 1, msGridRowSpan: 1, msGridColumn: 1, msGridColumnSpan: 1 });';
	const result = migrate(source);
	const css = result.generatedFiles[0]?.content;

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(css).toContain("padding: 8px;");
	expect(css).toContain("margin: 0;");
	expect(css).toContain("opacity: 0.5;");
	expect(css).toContain("line-height: 1.25;");
	expect(css).toContain("font-weight: 700;");
	expect(css).toContain("z-index: 2;");
	expect(css).toContain("--custom: 3;");
	expect(css).toContain("box-flex: 1px;");
	expect(css).toContain("box-flex-group: 1px;");
	expect(css).toContain("box-ordinal-group: 1px;");
	expect(css).toContain("flex-positive: 1px;");
	expect(css).toContain("flex-negative: 1px;");
	expect(css).toContain("flex-order: 1px;");
	expect(css).toContain("-ms-grid-row: 1px;");
	expect(css).toContain("-ms-grid-row-span: 1px;");
	expect(css).toContain("-ms-grid-column: 1px;");
	expect(css).toContain("-ms-grid-column-span: 1px;");
	expect({ css: stylesheetForSnapshot(css), residuals: result.residuals }).toMatchInlineSnapshot(`
		{
		  "css": ".root { padding: 8px; margin: 0; opacity: 0.5; line-height: 1.25; font-weight: 700; z-index: 2; --custom: 3; box-flex: 1px; box-flex-group: 1px; box-ordinal-group: 1px; flex-positive: 1px; flex-negative: 1px; flex-order: 1px; -ms-grid-row: 1px; -ms-grid-row-span: 1px; -ms-grid-column: 1px; -ms-grid-column-span: 1px; }
		/*# mapReference=Card.module.css.map */
		",
		  "residuals": [],
		}
	`);
});

test("styled-components -> CSS Modules preserves authored declaration precedence", () => {
	const source =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ marginTop: "2px", margin: "1px" });';
	const result = migrate(source);
	const css = result.generatedFiles[0]?.content;

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(css).toContain(".root { margin-top: 2px; margin: 1px; }");
	expect({ css: stylesheetForSnapshot(css), residuals: result.residuals }).toMatchInlineSnapshot(`
		{
		  "css": ".root { margin-top: 2px; margin: 1px; }
		/*# mapReference=Card.module.css.map */
		",
		  "residuals": [],
		}
	`);
});
