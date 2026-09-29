import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "vitest";
import {
	BuiltinHostFramework,
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
} from "pandwind-codemod/swap";

const catalog = createBuiltinCodemodCatalog();
const root = "/virtual/styled-components-generated-artifacts";
const source =
	'import styled from "styled-components";\n' +
	'export const Card = styled.div({ color: "red", padding: "1rem" });';

const migrate = (input: string, to: CodemodAdapterId, file = "src/Card.tsx") =>
	runAdapterMigration(input, {
		from: CodemodAdapterId.StyledComponents,
		to,
		file,
		root,
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

const typecheckGeneratedProject = (
	componentSource: string,
	generatedFiles: readonly { readonly path: string; readonly content: string }[],
	tag: "button" | "div" | "a" = "div",
	includeTransientProp = true,
	polymorphicAs = false,
): string => {
	const projectRoot = resolve(process.cwd(), "../../benchmarks/styling-tsc");
	const directory = mkdtempSync(join(projectRoot, ".codemod-styled-types-"));
	const sourceDirectory = join(directory, "src");
	const componentFile = join(sourceDirectory, "Card.tsx");
	const consumerFile = join(sourceDirectory, "App.tsx");
	const declarationsFile = join(directory, "styles.d.ts");
	const configFile = join(directory, "tsconfig.json");
	try {
		mkdirSync(sourceDirectory, { recursive: true });
		writeFileSync(componentFile, componentSource);
		for (const generatedFile of generatedFiles) {
			const generatedPath = join(directory, generatedFile.path);
			mkdirSync(dirname(generatedPath), { recursive: true });
			writeFileSync(generatedPath, generatedFile.content);
		}
		writeFileSync(
			consumerFile,
			'import { createRef } from "react";\n' +
				'import { Card } from "./Card";\n' +
				`const cardRef = createRef<HTML${polymorphicAs || tag === "a" ? "Anchor" : tag === "button" ? "Button" : "Div"}Element>();\n` +
				`export const App = () => <Card ref={cardRef}${polymorphicAs ? ' as="a" href="/card"' : ""} title="Card" className="consumer-class" style={{ display: "block" }}${includeTransientProp ? ' $tone="cool"' : ""}>Card</Card>;`,
		);
		writeFileSync(
			declarationsFile,
			'declare module "*.css";\ndeclare module "*.scss";\ndeclare module "*.less";',
		);
		writeFileSync(
			configFile,
			JSON.stringify(
				{
					compilerOptions: {
						jsx: "react-jsx",
						module: "ESNext",
						moduleResolution: "Bundler",
						allowImportingTsExtensions: true,
						noEmit: true,
						skipLibCheck: true,
						strict: true,
						target: "ESNext",
					},
					files: [componentFile, consumerFile, declarationsFile],
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
	generatedFiles: readonly { readonly path: string; readonly content: string }[],
): string => {
	const projectRoot = resolve(process.cwd(), "../../examples/showcase");
	const directory = mkdtempSync(join(projectRoot, ".codemod-styled-artifacts-"));
	const sourceDirectory = join(directory, "src");
	const rendererFile = join(directory, "render.mjs");
	try {
		mkdirSync(sourceDirectory);
		writeFileSync(join(sourceDirectory, "Card.tsx"), componentSource);
		for (const generatedFile of generatedFiles) {
			const generatedPath = join(directory, generatedFile.path);
			mkdirSync(dirname(generatedPath), { recursive: true });
			writeFileSync(generatedPath, generatedFile.content);
		}
		writeFileSync(
			join(sourceDirectory, "App.tsx"),
			'import { Card } from "./Card";\n' +
				'export const App = () => <><Card as="a" href="/card" type="submit" aria-label="Caller" title="Caller" className="caller-class" style={{ color: "red", display: "block" }} $tone="private">Save</Card><Card as="a" href="/again" type="submit" aria-label="Caller" title="Caller" className="caller-class" style={{ color: "red", display: "block" }} $tone="private">Again</Card></>;',
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

test("styled-components React wrappers emit idiomatic target sidecars", () => {
	const targets = [
		{
			id: CodemodAdapterId.AuthoredCss,
			path: "src/Card.styles.css",
			importSpecifier: "./Card.styles.css",
			importForm: "side-effect",
		},
		{
			id: CodemodAdapterId.Sass,
			path: "src/Card.styles.scss",
			importSpecifier: "./Card.styles.scss",
			importForm: "side-effect",
		},
		{
			id: CodemodAdapterId.Less,
			path: "src/Card.styles.less",
			importSpecifier: "./Card.styles.less",
			importForm: "side-effect",
		},
		{
			id: CodemodAdapterId.Treat,
			path: "src/Card.styles.treat.ts",
			importSpecifier: "./Card.styles.treat",
			importForm: "named",
		},
		{
			id: CodemodAdapterId.VanillaExtract,
			path: "src/Card.styles.css.ts",
			importSpecifier: "./Card.styles.css.ts",
			importForm: "named",
		},
	];
	const results = targets.map((target) => ({
		target: target.id,
		...migrate(source, target.id),
	}));

	for (const [index, result] of results.entries()) {
		const target = targets[index];
		expect(target).toBeDefined();
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.generatedFiles).toHaveLength(1);
		expect(result.generatedFiles[0]).toMatchObject({ path: target?.path });
		expect(result.code).toContain(JSON.stringify(target?.importSpecifier));
		expect(result.code).toContain(
			target?.importForm === "named"
				? `import { __pandwindCardStyles } from ${JSON.stringify(target.importSpecifier)};`
				: `import ${JSON.stringify(target?.importSpecifier)};`,
		);
		expect(result.code).toContain("forwardRef");
		expect(result.code).toContain("ComponentPropsWithoutRef");
		expect(result.code).toContain("ref, className:");
		expect(result.code).toContain("className");
		expect(typecheckGeneratedProject(result.code, result.generatedFiles, "div", true, true)).toBe(
			"",
		);
	}

	expect(
		results.map((result) => ({
			target: result.target,
			code: result.code,
			files: result.generatedFiles,
		})),
	).toMatchInlineSnapshot(`
		[
		  {
		    "code": "import { createElement as __pandwindCardCreateElement, forwardRef as __pandwindCardForwardRef } from "react";
		import "./Card.styles.css";
		import type { ComponentRef as __pandwindCardComponentRef, ComponentPropsWithoutRef as __pandwindCardComponentProps } from "react";
		export const Card = (() => { type __pandwindCardProps<As extends import("react").ElementType> = Omit<__pandwindCardComponentProps<As>, "as" | "forwardedAs" | "className" | "style"> & { as?: As; forwardedAs?: As; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindCardPolymorphicComponent = <As extends import("react").ElementType = "div">(props: __pandwindCardProps<As> & { ref?: import("react").Ref<__pandwindCardComponentRef<As>> }) => import("react").ReactElement | null; type __pandwindCardInternalProps = { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly forwardedAs?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; return __pandwindCardForwardRef<unknown, __pandwindCardInternalProps>((props, ref) => { const { as: propsAs, forwardedAs: propsForwardedAs, className, style, ...rest } = props; const attrs: { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } = ({}); const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const Component = (attrsAs ?? propsAs ?? propsForwardedAs ?? "div") as import("react").ElementType; return __pandwindCardCreateElement(Component, { ...Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))), ref, className: ["pw-Card-9l9ss5", attrsClassName, className].filter(Boolean).join(" "), style: Object.assign({}, style, attrsStyle) } as import("react").ComponentPropsWithRef<import("react").ElementType>); }) as __pandwindCardPolymorphicComponent; })();",
		    "files": [
		      {
		        "content": ".pw-Card-9l9ss5 { color: red; padding: 1rem; }
		",
		        "path": "src/Card.styles.css",
		        "purpose": "css styles for a migrated React component",
		      },
		    ],
		    "target": "authored-css",
		  },
		  {
		    "code": "import { createElement as __pandwindCardCreateElement, forwardRef as __pandwindCardForwardRef } from "react";
		import "./Card.styles.scss";
		import type { ComponentRef as __pandwindCardComponentRef, ComponentPropsWithoutRef as __pandwindCardComponentProps } from "react";
		export const Card = (() => { type __pandwindCardProps<As extends import("react").ElementType> = Omit<__pandwindCardComponentProps<As>, "as" | "forwardedAs" | "className" | "style"> & { as?: As; forwardedAs?: As; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindCardPolymorphicComponent = <As extends import("react").ElementType = "div">(props: __pandwindCardProps<As> & { ref?: import("react").Ref<__pandwindCardComponentRef<As>> }) => import("react").ReactElement | null; type __pandwindCardInternalProps = { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly forwardedAs?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; return __pandwindCardForwardRef<unknown, __pandwindCardInternalProps>((props, ref) => { const { as: propsAs, forwardedAs: propsForwardedAs, className, style, ...rest } = props; const attrs: { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } = ({}); const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const Component = (attrsAs ?? propsAs ?? propsForwardedAs ?? "div") as import("react").ElementType; return __pandwindCardCreateElement(Component, { ...Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))), ref, className: ["pw-Card-9l9ss5", attrsClassName, className].filter(Boolean).join(" "), style: Object.assign({}, style, attrsStyle) } as import("react").ComponentPropsWithRef<import("react").ElementType>); }) as __pandwindCardPolymorphicComponent; })();",
		    "files": [
		      {
		        "content": ".pw-Card-9l9ss5 { color: red; padding: 1rem; }
		",
		        "path": "src/Card.styles.scss",
		        "purpose": "sass styles for a migrated React component",
		      },
		    ],
		    "target": "sass",
		  },
		  {
		    "code": "import { createElement as __pandwindCardCreateElement, forwardRef as __pandwindCardForwardRef } from "react";
		import "./Card.styles.less";
		import type { ComponentRef as __pandwindCardComponentRef, ComponentPropsWithoutRef as __pandwindCardComponentProps } from "react";
		export const Card = (() => { type __pandwindCardProps<As extends import("react").ElementType> = Omit<__pandwindCardComponentProps<As>, "as" | "forwardedAs" | "className" | "style"> & { as?: As; forwardedAs?: As; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindCardPolymorphicComponent = <As extends import("react").ElementType = "div">(props: __pandwindCardProps<As> & { ref?: import("react").Ref<__pandwindCardComponentRef<As>> }) => import("react").ReactElement | null; type __pandwindCardInternalProps = { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly forwardedAs?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; return __pandwindCardForwardRef<unknown, __pandwindCardInternalProps>((props, ref) => { const { as: propsAs, forwardedAs: propsForwardedAs, className, style, ...rest } = props; const attrs: { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } = ({}); const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const Component = (attrsAs ?? propsAs ?? propsForwardedAs ?? "div") as import("react").ElementType; return __pandwindCardCreateElement(Component, { ...Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))), ref, className: ["pw-Card-9l9ss5", attrsClassName, className].filter(Boolean).join(" "), style: Object.assign({}, style, attrsStyle) } as import("react").ComponentPropsWithRef<import("react").ElementType>); }) as __pandwindCardPolymorphicComponent; })();",
		    "files": [
		      {
		        "content": ".pw-Card-9l9ss5 { color: red; padding: 1rem; }
		",
		        "path": "src/Card.styles.less",
		        "purpose": "less styles for a migrated React component",
		      },
		    ],
		    "target": "less",
		  },
		  {
		    "code": "import { __pandwindCardStyles } from "./Card.styles.treat";
		import { createElement as __pandwindCardCreateElement, forwardRef as __pandwindCardForwardRef } from "react";
		import type { ComponentRef as __pandwindCardComponentRef, ComponentPropsWithoutRef as __pandwindCardComponentProps } from "react";
		export const Card = (() => { type __pandwindCardProps<As extends import("react").ElementType> = Omit<__pandwindCardComponentProps<As>, "as" | "forwardedAs" | "className" | "style"> & { as?: As; forwardedAs?: As; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindCardPolymorphicComponent = <As extends import("react").ElementType = "div">(props: __pandwindCardProps<As> & { ref?: import("react").Ref<__pandwindCardComponentRef<As>> }) => import("react").ReactElement | null; type __pandwindCardInternalProps = { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly forwardedAs?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; return __pandwindCardForwardRef<unknown, __pandwindCardInternalProps>((props, ref) => { const { as: propsAs, forwardedAs: propsForwardedAs, className, style, ...rest } = props; const attrs: { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } = ({}); const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const Component = (attrsAs ?? propsAs ?? propsForwardedAs ?? "div") as import("react").ElementType; return __pandwindCardCreateElement(Component, { ...Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))), ref, className: [__pandwindCardStyles, attrsClassName, className].filter(Boolean).join(" "), style: Object.assign({}, style, attrsStyle) } as import("react").ComponentPropsWithRef<import("react").ElementType>); }) as __pandwindCardPolymorphicComponent; })();",
		    "files": [
		      {
		        "content": "import { style } from "treat";
		export const __pandwindCardStyles = style({ "color": "red", "padding": "1rem" });
		",
		        "path": "src/Card.styles.treat.ts",
		        "purpose": "Treat styles for a migrated React component",
		      },
		    ],
		    "target": "treat",
		  },
		  {
		    "code": "import { __pandwindCardStyles } from "./Card.styles.css.ts";
		import { createElement as __pandwindCardCreateElement, forwardRef as __pandwindCardForwardRef } from "react";
		import type { ComponentRef as __pandwindCardComponentRef, ComponentPropsWithoutRef as __pandwindCardComponentProps } from "react";
		export const Card = (() => { type __pandwindCardProps<As extends import("react").ElementType> = Omit<__pandwindCardComponentProps<As>, "as" | "forwardedAs" | "className" | "style"> & { as?: As; forwardedAs?: As; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindCardPolymorphicComponent = <As extends import("react").ElementType = "div">(props: __pandwindCardProps<As> & { ref?: import("react").Ref<__pandwindCardComponentRef<As>> }) => import("react").ReactElement | null; type __pandwindCardInternalProps = { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly forwardedAs?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; return __pandwindCardForwardRef<unknown, __pandwindCardInternalProps>((props, ref) => { const { as: propsAs, forwardedAs: propsForwardedAs, className, style, ...rest } = props; const attrs: { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } = ({}); const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const Component = (attrsAs ?? propsAs ?? propsForwardedAs ?? "div") as import("react").ElementType; return __pandwindCardCreateElement(Component, { ...Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))), ref, className: [__pandwindCardStyles, attrsClassName, className].filter(Boolean).join(" "), style: Object.assign({}, style, attrsStyle) } as import("react").ComponentPropsWithRef<import("react").ElementType>); }) as __pandwindCardPolymorphicComponent; })();",
		    "files": [
		      {
		        "content": "import { style } from "@vanilla-extract/css";
		export const __pandwindCardStyles = style({ color: "red", padding: "1rem" });
		",
		        "path": "src/Card.styles.css.ts",
		        "purpose": "Vanilla Extract styles for a migrated React component",
		      },
		    ],
		    "target": "vanilla-extract",
		  },
		]
	`);
});

test("styled-components to authored CSS preserves attrs, caller props, refs, and repeat use", () => {
	const input =
		'import styled from "styled-components";\n' +
		'export const Card = styled.button.attrs({ type: "button", "aria-label": "Saved", title: "Styled", className: "attrs-class", style: { color: "blue" }, $tone: "base" })({ color: "red" });\n' +
		"export const App = () => <><Card /><Card /></>;";
	const result = migrate(input, CodemodAdapterId.AuthoredCss);
	const html = JSON.parse(renderGeneratedProject(result.code, result.generatedFiles));

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.generatedFiles).toHaveLength(1);
	expect(typecheckGeneratedProject(result.code, result.generatedFiles, "button", false, true)).toBe(
		"",
	);
	expect(result.code.match(/import "\.\/Card\.styles\.css";/gu)).toHaveLength(1);
	expect(html.match(/<a\b/gu)).toHaveLength(2);
	expect(html).toContain('href="/card"');
	expect(html).toContain('href="/again"');
	expect(html).toContain('type="button"');
	expect(html).toContain('aria-label="Saved"');
	expect(html).toContain('title="Styled"');
	expect(html).toContain("attrs-class caller-class");
	expect(html).toContain("color:blue");
	expect(html).toContain("display:block");
	expect(html).not.toContain("color:red");
	expect(html).not.toContain("$tone");
	expect(html).toContain(">Save</a>");
	expect({ code: result.code, files: result.generatedFiles, html }).toMatchInlineSnapshot(`
		{
		  "code": "import { createElement as __pandwindCardCreateElement, forwardRef as __pandwindCardForwardRef } from "react";
		import "./Card.styles.css";
		import type { ComponentRef as __pandwindCardComponentRef, ComponentPropsWithoutRef as __pandwindCardComponentProps } from "react";
		export const Card = (() => { type __pandwindCardProps<As extends import("react").ElementType> = Omit<__pandwindCardComponentProps<As>, "as" | "forwardedAs" | "className" | "style"> & { as?: As; forwardedAs?: As; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindCardPolymorphicComponent = <As extends import("react").ElementType = "button">(props: __pandwindCardProps<As> & { ref?: import("react").Ref<__pandwindCardComponentRef<As>> }) => import("react").ReactElement | null; type __pandwindCardInternalProps = { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly forwardedAs?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; return __pandwindCardForwardRef<unknown, __pandwindCardInternalProps>((props, ref) => { const { as: propsAs, forwardedAs: propsForwardedAs, className, style, ...rest } = props; const attrs: { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } = ({ type: "button", "aria-label": "Saved", title: "Styled", className: "attrs-class", style: { color: "blue" }, $tone: "base" }); const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const Component = (attrsAs ?? propsAs ?? propsForwardedAs ?? "button") as import("react").ElementType; return __pandwindCardCreateElement(Component, { ...Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))), ref, className: ["pw-Card-9l9ss5", attrsClassName, className].filter(Boolean).join(" "), style: Object.assign({}, style, attrsStyle) } as import("react").ComponentPropsWithRef<import("react").ElementType>); }) as __pandwindCardPolymorphicComponent; })();
		export const App = () => <><Card /><Card /></>;",
		  "files": [
		    {
		      "content": ".pw-Card-9l9ss5 { color: red; }
		",
		      "path": "src/Card.styles.css",
		      "purpose": "css styles for a migrated React component",
		    },
		  ],
		  "html": "<a href="/card" type="button" aria-label="Saved" title="Styled" class="pw-Card-9l9ss5 attrs-class caller-class" style="color:blue;display:block">Save</a><a href="/again" type="button" aria-label="Saved" title="Styled" class="pw-Card-9l9ss5 attrs-class caller-class" style="color:blue;display:block">Again</a>",
		}
	`);
});

test("styled-components CSS sidecars preserve literal polymorphic hosts", () => {
	const sourceWithPropAs =
		'import styled from "styled-components";\n' +
		'export const Card = styled.div({ color: "red" });\n' +
		'export const App = () => <Card as="a" href="/card">Open</Card>;';
	const propAsResult = migrate(sourceWithPropAs, CodemodAdapterId.AuthoredCss);
	const attrsAsResult = migrate(
		'import styled from "styled-components";\n' +
			'export const Card = styled.button.attrs({ as: "a" })({ color: "red" });',
		CodemodAdapterId.AuthoredCss,
	);

	for (const result of [propAsResult, attrsAsResult]) {
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.generatedFiles).toHaveLength(1);
		expect(result.code).toContain("PolymorphicComponent");
	}
	expect(
		typecheckGeneratedProject(propAsResult.code, propAsResult.generatedFiles, "div", true, true),
	).toBe("");
	expect(
		typecheckGeneratedProject(attrsAsResult.code, attrsAsResult.generatedFiles, "a", false),
	).toBe("");
	expect({ propAs: propAsResult.code, attrsAs: attrsAsResult.code }).toMatchInlineSnapshot(`
		{
		  "attrsAs": "import { createElement as __pandwindCardCreateElement, forwardRef as __pandwindCardForwardRef } from "react";
		import "./Card.styles.css";
		import type { ComponentRef as __pandwindCardComponentRef, ComponentPropsWithoutRef as __pandwindCardComponentProps } from "react";
		export const Card = (() => { type __pandwindCardProps<As extends import("react").ElementType> = Omit<__pandwindCardComponentProps<As>, "as" | "forwardedAs" | "className" | "style"> & { as?: As; forwardedAs?: As; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindCardPolymorphicComponent = <As extends import("react").ElementType = "a">(props: __pandwindCardProps<As> & { ref?: import("react").Ref<__pandwindCardComponentRef<As>> }) => import("react").ReactElement | null; type __pandwindCardInternalProps = { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly forwardedAs?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; return __pandwindCardForwardRef<unknown, __pandwindCardInternalProps>((props, ref) => { const { as: propsAs, forwardedAs: propsForwardedAs, className, style, ...rest } = props; const attrs: { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } = ({ as: "a" }); const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const Component = (attrsAs ?? propsAs ?? propsForwardedAs ?? "a") as import("react").ElementType; return __pandwindCardCreateElement(Component, { ...Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))), ref, className: ["pw-Card-9l9ss5", attrsClassName, className].filter(Boolean).join(" "), style: Object.assign({}, style, attrsStyle) } as import("react").ComponentPropsWithRef<import("react").ElementType>); }) as __pandwindCardPolymorphicComponent; })();",
		  "propAs": "import { createElement as __pandwindCardCreateElement, forwardRef as __pandwindCardForwardRef } from "react";
		import "./Card.styles.css";
		import type { ComponentRef as __pandwindCardComponentRef, ComponentPropsWithoutRef as __pandwindCardComponentProps } from "react";
		export const Card = (() => { type __pandwindCardProps<As extends import("react").ElementType> = Omit<__pandwindCardComponentProps<As>, "as" | "forwardedAs" | "className" | "style"> & { as?: As; forwardedAs?: As; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __pandwindCardPolymorphicComponent = <As extends import("react").ElementType = "div">(props: __pandwindCardProps<As> & { ref?: import("react").Ref<__pandwindCardComponentRef<As>> }) => import("react").ReactElement | null; type __pandwindCardInternalProps = { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly forwardedAs?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; return __pandwindCardForwardRef<unknown, __pandwindCardInternalProps>((props, ref) => { const { as: propsAs, forwardedAs: propsForwardedAs, className, style, ...rest } = props; const attrs: { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties } = ({}); const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const Component = (attrsAs ?? propsAs ?? propsForwardedAs ?? "div") as import("react").ElementType; return __pandwindCardCreateElement(Component, { ...Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))), ref, className: ["pw-Card-9l9ss5", attrsClassName, className].filter(Boolean).join(" "), style: Object.assign({}, style, attrsStyle) } as import("react").ComponentPropsWithRef<import("react").ElementType>); }) as __pandwindCardPolymorphicComponent; })();
		export const App = () => <Card as="a" href="/card">Open</Card>;",
		}
	`);
});

test("styled-components JSX modules use an untyped React wrapper", () => {
	const result = migrate(source, CodemodAdapterId.AuthoredCss, "src/Card.jsx");

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain("forwardRef");
	expect(result.code).not.toContain("ComponentPropsWithoutRef");
	expect(result.code).not.toContain("ComponentRef");
	expect(result.code).not.toContain("<__pandwind");
	expect(result.generatedFiles).toHaveLength(1);
	expect({ code: result.code, files: result.generatedFiles }).toMatchInlineSnapshot(`
		{
		  "code": "import { createElement as __pandwindCardCreateElement, forwardRef as __pandwindCardForwardRef } from "react";
		import "./Card.styles.css";
		export const Card = __pandwindCardForwardRef((props, ref) => { const { as: propsAs, forwardedAs: propsForwardedAs, className, style, ...rest } = props; const attrs = ({}); const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const Component = attrsAs ?? propsAs ?? propsForwardedAs ?? "div"; return __pandwindCardCreateElement(Component, { ...Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))), ref, className: ["pw-Card-1dfsa8z", attrsClassName, className].filter(Boolean).join(" "), style: Object.assign({}, style, attrsStyle) }); });",
		  "files": [
		    {
		      "content": ".pw-Card-1dfsa8z { color: red; padding: 1rem; }
		",
		      "path": "src/Card.styles.css",
		      "purpose": "css styles for a migrated React component",
		    },
		  ],
		}
	`);
});

test("styled-components Emotion wraps literal attrs in a reusable ref-forwarding component", () => {
	const input =
		'import styled from "styled-components";\n' +
		'export const Card = styled.button.attrs({ type: "button", "aria-label": "Saved", title: "Styled", $internal: "private" })({ color: "red" });\n' +
		'export const App = () => <Card type="submit" aria-label="Caller" data-testid="save" />;';
	const result = migrate(input, CodemodAdapterId.Emotion);

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.generatedFiles).toEqual([]);
	expect(result.code).not.toContain("styled-components");
	expect(result.code).toContain('import styled from "@emotion/styled";');
	expect(result.code).toContain("forwardRef");
	expect(result.code).toContain('type: "button"');
	expect(result.code).toContain('"aria-label": "Saved"');
	expect(result.code).toContain('$internal: "private"');
	expect(result.code).toContain('!["$"].some');
	expect(result.code).toContain('data-testid="save"');
	expect(typecheckGeneratedProject(result.code, result.generatedFiles, "button", false, true)).toBe(
		"",
	);
	expect({ code: result.code, residuals: result.residuals }).toMatchInlineSnapshot(`
		{
		  "code": "import styled from "@emotion/styled";
		import { createElement as __pandwindCreateElement, forwardRef as __pandwindForwardRef } from "react";
		export const Card = (<ComponentType extends import("react").ElementType, Attrs extends Record<string, unknown>,>(Component: ComponentType, attrs: Attrs) => { type Props<As extends import("react").ElementType> = Omit<import("react").ComponentPropsWithoutRef<As>, "as" | "className" | "style"> & { as?: As; className?: string; style?: import("react").CSSProperties }; type PolymorphicComponent = <As extends import("react").ElementType = ComponentType>(props: Props<As> & { ref?: import("react").Ref<import("react").ComponentRef<As>> }) => import("react").ReactElement | null; type InternalProps = { readonly [key: string]: unknown; readonly as?: import("react").ElementType; readonly className?: string; readonly style?: import("react").CSSProperties }; const Wrapped = __pandwindForwardRef<unknown, InternalProps>((props, ref) => { const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const { as: propsAs, className, style, ...rest } = props; const forwardedProps = Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !["$"].some((prefix) => key.startsWith(prefix)))); return __pandwindCreateElement(Component, { ...forwardedProps, ...(propsAs === undefined && attrsAs === undefined ? {} : { as: attrsAs ?? propsAs }), className: [className, attrsClassName].filter(Boolean).join(" ") || undefined, style: Object.assign({}, style, attrsStyle !== null && typeof attrsStyle === "object" ? attrsStyle : {}), ref } as import("react").ComponentPropsWithRef<ComponentType>); }); return Wrapped as PolymorphicComponent; })(styled.button({ color: "red" }), ({ type: "button", "aria-label": "Saved", title: "Styled", $internal: "private" }));
		export const App = () => <Card type="submit" aria-label="Caller" data-testid="save" />;",
		  "residuals": [],
		}
	`);
});

test("styled-components Emotion keeps dynamic attrs as a typed residual", () => {
	const input =
		'import styled from "styled-components";\n' +
		'export const Button = styled.button.attrs((props) => ({ title: props.title }))({ color: "red" });';
	const result = migrate(input, CodemodAdapterId.Emotion);

	expect(result.converted).toBe(0);
	expect(result.skipped).toBeGreaterThan(0);
	expect(result.residuals.length).toBeGreaterThan(0);
	expect(result.code).toContain("styled.button.attrs((props) => ({ title: props.title }))");
	expect(result.code).toContain("pandwind:migrate-skip");
	expect({ code: result.code, residuals: result.residuals }).toMatchInlineSnapshot(`
		{
		  "code": "import styled from "styled-components";
		// pandwind:migrate-skip (route: styled-components -> emotion | lowering-residual: host-framework | available: static, named-map, residual)
		export const Button = styled.button.attrs((props) => ({ title: props.title }))({ color: "red" });",
		  "residuals": [
		    {
		      "hint": "Emotion attrs conversion requires a React intrinsic with statically verifiable attributes",
		      "kind": "host-framework",
		      "text": "(props) => ({ title: props.title })",
		    },
		  ],
		}
	`);
});

test("dynamic styled-components values remain source-preserving typed residuals", () => {
	const input =
		'import styled from "styled-components";\n' +
		"export const Card = styled.div({ color: (props) => props.color });";
	const result = migrate(input, CodemodAdapterId.AuthoredCss);

	expect(result.converted).toBe(0);
	expect(result.skipped).toBeGreaterThan(0);
	expect(result.generatedFiles).toEqual([]);
	expect(result.residuals.length).toBeGreaterThan(0);
	expect(result.residuals.every((residual) => residual.kind.length > 0)).toBe(true);
	expect(result.code).toContain("styled.div({ color: (props) => props.color })");
	expect(result.code).toContain("pandwind:migrate-skip");
	expect({ code: result.code, residuals: result.residuals }).toMatchInlineSnapshot(`
		{
		  "code": "import styled from "styled-components";
		// pandwind:migrate-skip (route: styled-components -> authored-css | lowering-residual: component)
		export const Card = styled.div({ color: (props) => props.color });",
		  "residuals": [
		    {
		      "hint": "dynamic values need a target runtime or verified CSS variable carrier",
		      "kind": "component",
		      "text": "Card",
		    },
		  ],
		}
	`);
});
