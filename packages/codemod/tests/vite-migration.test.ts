import { describe, expect, test } from "vitest";
import type { AdapterGeneratedFile, StyleAdapter } from "../src/swap/index.ts";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	createStyleAdapterRegistry,
} from "../src/swap/index.ts";
import { createVirtualMigrationPlugin as createVitePlugin } from "../src/swap/virtual-migration-core.ts";

const yumcssMigrateVite = (
	options: Parameters<typeof createVitePlugin>[0],
): ReturnType<typeof createVitePlugin> => createVitePlugin(options);

const catalog = createBuiltinCodemodCatalog();
const virtualPrefix = String.fromCharCode(0);

const styledCard = `import styled from "styled-components";

const Card = styled.div\`
	color: red;
	padding: 1rem;
\`;

export function App() {
	return <Card>content</Card>;
}
`;

function generatedTarget(createFile: (index: number) => AdapterGeneratedFile): StyleAdapter {
	const yumcss = catalog.registry.get(CodemodAdapterId.YumCSS)!;
	return {
		...yumcss,
		id: "test-generated-target",
		emit(program, context) {
			const emitted = yumcss.emit(program, context);
			return { ...emitted, generatedFiles: [createFile(context.index)] };
		},
	};
}

describe("virtual Vite migrations", () => {
	test("transforms real styled-components source without changing the file", async () => {
		const plugin = yumcssMigrateVite({
			from: CodemodAdapterId.StyledComponents,
			to: CodemodAdapterId.Tailwind,
			root: "/virtual/project",
		});
		const file = "/virtual/project/src/Card.tsx";
		const result = await plugin.transform(styledCard, file);

		expect(plugin.enforce).toBe("pre");
		expect(plugin.name).toBe("yumcss:virtual-migration:styled-components->tailwind");
		expect(result).toMatchInlineSnapshot(`
			{
			  "code": "import { forwardRef as __yumcssCardForwardRef } from "react";
			import type { ComponentPropsWithoutRef as __yumcssCardPropsWithoutRef, ComponentRef as __yumcssCardRef, ElementType as __yumcssCardElementType, ReactElement as __yumcssCardReactElement, Ref as __yumcssCardRefProp } from "react";

			const Card = (() => { type __yumcssCardProps<C extends __yumcssCardElementType> = Omit<__yumcssCardPropsWithoutRef<C>, "as" | "forwardedAs" | "className" | "style"> & { as?: C; forwardedAs?: C; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __yumcssCardComponent = <C extends __yumcssCardElementType = "div">(props: __yumcssCardProps<C> & { ref?: __yumcssCardRefProp<__yumcssCardRef<C>> }) => __yumcssCardReactElement | null; type __yumcssCardRuntimeProps = Record<string, any>; return __yumcssCardForwardRef<__yumcssCardRef<"div">, __yumcssCardRuntimeProps>((props, ref) => { const Component = props.as ?? props.forwardedAs ?? "div"; const { as: _as, forwardedAs: _forwardedAs, ...rest } = props; return <Component {...Object.fromEntries(Object.entries(rest).filter(([key]) => !["$"].some((prefix) => key.startsWith(prefix))))} ref={ref} className={["[color:red] [padding:1rem]", props.className].filter(Boolean).join(" ")} />; }) as __yumcssCardComponent; })();

			export function App() {
				return <Card>content</Card>;
			}
			",
			  "map": SourceMap {
			    "file": undefined,
			    "mappings": "AAAA,MAAM,CAAC;AAAA;AAAA;AAAA,giCAKN;;AAED,MAAM,CAAC,QAAQ,CAAC,GAAG,CAAC,CAAC,CAAC;AACtB,CAAC,MAAM,CAAC,CAAC,IAAI,CAAC,OAAO,CAAC,CAAC,IAAI,CAAC;AAC5B;",
			    "names": [],
			    "sources": [
			      "/virtual/project/src/Card.tsx",
			    ],
			    "sourcesContent": [
			      "import styled from "styled-components";

			const Card = styled.div\`
				color: red;
				padding: 1rem;
			\`;

			export function App() {
				return <Card>content</Card>;
			}
			",
			    ],
			    "version": 3,
			  },
			}
		`);
		expect(result).not.toBeNull();
		expect(result?.code).toContain("const Card = (() => {");
		expect(result?.code).toContain(
			'className={["[color:red] [padding:1rem]", props.className].filter(Boolean).join(" ")}',
		);
		expect(result?.code).toContain("ref={ref}");
		expect(result?.code).toContain("return <Card>content</Card>");
		expect(result?.code).not.toContain("styled-components");
		expect(styledCard).toContain("styled-components");
	});

	test("reports residual semantics while preserving the original module", async () => {
		const residuals: Array<{ file: string; route: unknown }> = [];
		const source = `import styled, { ThemeProvider } from "styled-components";

export function App() {
		return <ThemeProvider theme={{ color: "red" }}><div /></ThemeProvider>;
}
`;
		const plugin = yumcssMigrateVite({
			from: CodemodAdapterId.StyledComponents,
			to: CodemodAdapterId.Tailwind,
			root: "/virtual/project",
			onResidual: (event) => residuals.push(event),
		});
		const result = await plugin.transform(source, "/virtual/project/src/App.tsx");

		expect(result).toMatchInlineSnapshot(`
			{
			  "code": "// yumcss:migrate-skip (route: styled-components -> tailwind | parse-residual: runtime-context | available: named-map, residual)
			import styled, { ThemeProvider } from "styled-components";

			export function App() {
			// yumcss:migrate-skip (route: styled-components -> tailwind | parse-residual: runtime-context | available: named-map, residual)
					return <ThemeProvider theme={{ color: "red" }}><div /></ThemeProvider>;
			}
			",
			  "map": SourceMap {
			    "file": undefined,
			    "mappings": "AAAA;AAAA;AAAA;AAAA;AAAA;AAGA,CAAC,CAAC,MAAM,CAAC,CAAC,aAAa,CAAC,KAAK,CAAC,CAAC,CAAC,CAAC,KAAK,CAAC,CAAC,CAAC,GAAG,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,GAAG,CAAC,CAAC,CAAC,CAAC,CAAC,aAAa,CAAC;AACxE;",
			    "names": [],
			    "sources": [
			      "/virtual/project/src/App.tsx",
			    ],
			    "sourcesContent": [
			      "import styled, { ThemeProvider } from "styled-components";

			export function App() {
					return <ThemeProvider theme={{ color: "red" }}><div /></ThemeProvider>;
			}
			",
			    ],
			    "version": 3,
			  },
			}
		`);
		expect(result).not.toBeNull();
		expect(result?.code).toContain("yumcss:migrate-skip");
		expect(result?.code).toContain('<ThemeProvider theme={{ color: "red" }}>');
		expect(residuals).toMatchInlineSnapshot(`
			[
			  {
			    "file": "/virtual/project/src/App.tsx",
			    "residuals": [
			      {
			        "hint": "styled-components runtime providers require target-aware context lowering",
			        "kind": "runtime-context",
			        "text": "import styled, { ThemeProvider } from "styled-components";",
			      },
			      {
			        "hint": "styled-components runtime providers require target-aware context lowering",
			        "kind": "runtime-context",
			        "text": "<ThemeProvider theme={{ color: "red" }}>",
			      },
			    ],
			    "route": {
			      "from": "styled-components",
			      "to": "tailwind",
			    },
			  },
			]
		`);
		expect(residuals).toHaveLength(1);
		expect(residuals[0]?.file).toBe("/virtual/project/src/App.tsx");
		expect(residuals[0]?.route).toEqual({
			from: CodemodAdapterId.StyledComponents,
			to: CodemodAdapterId.Tailwind,
		});
	});

	test("uses shared scanner eligibility and include/exclude policies", async () => {
		const plugin = yumcssMigrateVite({
			from: CodemodAdapterId.StyledComponents,
			to: CodemodAdapterId.Tailwind,
			include: [/src\/Card\.tsx$/gu],
			exclude: [/excluded/u],
		});

		expect(await plugin.transform(styledCard, "/project/src/Card.css")).toBeNull();
		expect(await plugin.transform(styledCard, "/project/src/Card.tsx?direct")).not.toBeNull();
		expect(await plugin.transform(styledCard, "/project/src/excluded/Card.tsx")).toBeNull();
		expect(await plugin.transform(styledCard, "/project/node_modules/pkg/Card.tsx")).toBeNull();
		expect(await plugin.transform(styledCard, "\0virtual.tsx")).toBeNull();
	});

	test("hands the virtual result to the host target plugin after pre-transform", async () => {
		const plugin = yumcssMigrateVite({
			from: CodemodAdapterId.StyledComponents,
			to: CodemodAdapterId.Tailwind,
			root: "/project",
		});
		const received: string[] = [];
		const targetPlugin = {
			transform(code: string) {
				received.push(code);
				return null;
			},
		};
		const result = await plugin.transform(styledCard, "/project/src/Card.tsx");
		targetPlugin.transform(result?.code ?? styledCard);

		expect(plugin.enforce).toBe("pre");
		expect(received).toMatchInlineSnapshot(`
			[
			  "import { forwardRef as __yumcssCardForwardRef } from "react";
			import type { ComponentPropsWithoutRef as __yumcssCardPropsWithoutRef, ComponentRef as __yumcssCardRef, ElementType as __yumcssCardElementType, ReactElement as __yumcssCardReactElement, Ref as __yumcssCardRefProp } from "react";

			const Card = (() => { type __yumcssCardProps<C extends __yumcssCardElementType> = Omit<__yumcssCardPropsWithoutRef<C>, "as" | "forwardedAs" | "className" | "style"> & { as?: C; forwardedAs?: C; className?: string; style?: import("react").CSSProperties } & { readonly [key in \`$\${string}\`]?: unknown }; type __yumcssCardComponent = <C extends __yumcssCardElementType = "div">(props: __yumcssCardProps<C> & { ref?: __yumcssCardRefProp<__yumcssCardRef<C>> }) => __yumcssCardReactElement | null; type __yumcssCardRuntimeProps = Record<string, any>; return __yumcssCardForwardRef<__yumcssCardRef<"div">, __yumcssCardRuntimeProps>((props, ref) => { const Component = props.as ?? props.forwardedAs ?? "div"; const { as: _as, forwardedAs: _forwardedAs, ...rest } = props; return <Component {...Object.fromEntries(Object.entries(rest).filter(([key]) => !["$"].some((prefix) => key.startsWith(prefix))))} ref={ref} className={["[color:red] [padding:1rem]", props.className].filter(Boolean).join(" ")} />; }) as __yumcssCardComponent; })();

			export function App() {
				return <Card>content</Card>;
			}
			",
			]
		`);
		expect(received).toHaveLength(1);
		expect(received[0]).toContain(
			'className={["[color:red] [padding:1rem]", props.className].filter(Boolean).join(" ")}',
		);
		expect(received[0]).toContain("ref={ref}");
		expect(received[0]).toContain("<Card>content</Card>");
		expect(received[0]).not.toContain("styled-components");
	});

	test("is idempotent after the target adapter has emitted classes", async () => {
		const plugin = yumcssMigrateVite({
			from: CodemodAdapterId.StyledComponents,
			to: CodemodAdapterId.Tailwind,
			root: "/project",
		});
		const file = "/project/src/Card.tsx";
		const first = await plugin.transform(styledCard, file);
		expect(first).not.toBeNull();
		expect(await plugin.transform(first!.code, file)).toBeNull();
	});

	test("serves deduplicated target-generated files as virtual modules", async () => {
		const target = generatedTarget(() => ({
			path: "src/styles/migration-theme.ts",
			purpose: "shared migration theme",
			content: 'export const migrationTheme = { brand: "#0ea5e9" } as const;\n',
		}));
		const source = 'import { css } from "@emotion/css";\nconst card = css({ color: "red" });\n';
		const registry = createStyleAdapterRegistry([
			catalog.registry.get(CodemodAdapterId.Emotion)!,
			target,
		]);
		const plugin = yumcssMigrateVite({
			from: CodemodAdapterId.Emotion,
			to: target.id,
			root: "/virtual/project",
			adapterRegistry: registry,
		});
		const file = "/virtual/project/src/Card.tsx";
		const result = await plugin.transform(source, file);
		const virtualId = plugin.resolveId(
			"./styles/migration-theme.ts",
			"/virtual/project/src/Card.tsx",
		);

		expect(result).toMatchInlineSnapshot(`
			{
			  "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			const card = css.class({ color: "red" });
			",
			  "map": SourceMap {
			    "file": undefined,
			    "mappings": "AAAA,MAAM,CAAC,CAAC,CAAC,CAAC;AAAA;AAAA,oBACI,EAAE,CAAC,CAAC,CAAC,KAAK,CAAC,CAAC,CAAC,GAAG,CAAC,CAAC,CAAC,CAAC;",
			    "names": [],
			    "sources": [
			      "/virtual/project/src/Card.tsx",
			    ],
			    "sourcesContent": [
			      "import { css } from "@emotion/css";
			const card = css({ color: "red" });
			",
			    ],
			    "version": 3,
			  },
			}
		`);
		expect(result).not.toBeNull();
		expect(virtualId?.replace(virtualPrefix, "<NUL>")).toMatchInlineSnapshot(
			`"<NUL>yumcss:migration:/virtual/project/src/styles/migration-theme.ts"`,
		);
		expect(virtualId).not.toBeNull();
		expect(plugin.load(virtualId!)).toMatchInlineSnapshot(`
			"export const migrationTheme = { brand: "#0ea5e9" } as const;
			"
		`);
		expect(plugin.resolveId("@emotion/css", file)).toBeNull();
		plugin.watchChange(file);
		expect(plugin.load(virtualId!)).toBeNull();
	});

	test("resets virtual artifacts when the bundler resolves a new project root", async () => {
		const plugin = yumcssMigrateVite({
			from: CodemodAdapterId.Emotion,
			to: CodemodAdapterId.YumCSS,
			root: "/old-project",
		});
		const source = 'import { css } from "@emotion/css";\nconst card = css({ color: "red" });\n';
		await plugin.transform(source, "/old-project/src/Card.tsx");

		plugin.vite.configResolved({ root: "/new-project" });
		expect(plugin.resolveId("./styles/migration-theme.ts", "/new-project/src/Card.tsx")).toBeNull();
	});

	test("keeps generated-file conflicts as an explicit safe failure", async () => {
		const first = generatedTarget((index) => ({
			path: "src/styles/migration-theme.ts",
			purpose: "shared migration theme",
			content: `export const migrationTheme = ${index};\n`,
		}));
		const registry = createStyleAdapterRegistry([
			catalog.registry.get(CodemodAdapterId.Emotion)!,
			first,
		]);
		const source =
			'import { css } from "@emotion/css";\n' +
			'const card = css({ color: "red" });\n' +
			'const panel = css({ color: "blue" });\n';

		const residuals: unknown[] = [];
		const safePlugin = yumcssMigrateVite({
			from: CodemodAdapterId.Emotion,
			to: first.id,
			root: "/virtual/project",
			adapterRegistry: registry,
			onResidual: (event) => residuals.push(event),
		});
		const result = await safePlugin.transform(source, "/virtual/project/src/Card.tsx");

		expect(result).toMatchInlineSnapshot(`
			{
			  "code": "// yumcss:migrate-skip (route: emotion -> test-generated-target | lowering-residual: generated-file)
			import { css } from "@emotion/css";
			const card = css({ color: "red" });
			const panel = css({ color: "blue" });
			",
			  "map": SourceMap {
			    "file": undefined,
			    "mappings": ";AAAA,MAAM,CAAC,CAAC,CAAC,GAAG,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CAAC,OAAO,CAAC,GAAG,CAAC;AAClC,KAAK,CAAC,IAAI,CAAC,CAAC,CAAC,GAAG,CAAC,CAAC,CAAC,KAAK,CAAC,CAAC,CAAC,GAAG,CAAC,CAAC,CAAC,CAAC;AAClC,KAAK,CAAC,KAAK,CAAC,CAAC,CAAC,GAAG,CAAC,CAAC,CAAC,KAAK,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CAAC,CAAC;",
			    "names": [],
			    "sources": [
			      "/virtual/project/src/Card.tsx",
			    ],
			    "sourcesContent": [
			      "import { css } from "@emotion/css";
			const card = css({ color: "red" });
			const panel = css({ color: "blue" });
			",
			    ],
			    "version": 3,
			  },
			}
		`);
		expect(result).not.toBeNull();
		expect(result?.code).toContain("yumcss:migrate-skip");
		expect(result?.code).toContain("@emotion/css");
		expect(residuals).toMatchInlineSnapshot(`
			[
			  {
			    "file": "/virtual/project/src/Card.tsx",
			    "residuals": [
			      {
			        "hint": "multiple target emissions produced conflicting content for one generated file",
			        "kind": "generated-file",
			        "text": "src/styles/migration-theme.ts",
			      },
			    ],
			    "route": {
			      "from": "emotion",
			      "to": "test-generated-target",
			    },
			  },
			]
		`);
		expect(residuals).toHaveLength(1);
	});
});
