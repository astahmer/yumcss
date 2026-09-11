const generatedWindTypes = String(
	import.meta.glob("../types.d.ts", { eager: true, import: "default", query: "?raw" })[
		"../types.d.ts"
	] ?? "",
);
const windTypes = generatedWindTypes.replace("export type WindVariants", "type WindVariants");

const generatedPandwindTypes = import.meta.glob("../generated/pandwind/**/*.d.ts", {
	eager: true,
	import: "default",
	query: "?raw",
});

const generatedDependencyTypes = import.meta.glob(
	"../generated/dependencies/**/*.{d.ts,d.mts,d.cts}",
	{
		eager: true,
		import: "default",
		query: "?raw",
	},
);

const packageTypeLibraries = Object.entries(generatedPandwindTypes).map(([path, content]) => ({
	filePath: `file:///pandwind/playground/generated/pandwind/${path.replace("../generated/pandwind/", "")}`,
	content: String(content),
}));

const dependencyTypeLibraries = Object.entries(generatedDependencyTypes).map(([path, content]) => ({
	filePath: `file:///pandwind/playground/generated/dependencies/${path.replace("../generated/dependencies/", "")}`,
	content: String(content),
}));

/**
 * Monaco's TypeScript worker has no access to the host filesystem. The
 * declaration graph is generated from the workspace-linked `pandwind`
 * package before dev/build, then mounted under a virtual package tree here.
 * Relative imports are redirected to emitted declarations so the editor uses
 * the same `CssFn`, `CxFn`, design types, and option contracts as the package.
 */
/** TypeScript paths for every Pandwind public module used by the playground. */
export const PANDWIND_EDITOR_MODULE_PATHS = {
	pandwind: "generated/pandwind/index.d.ts",
	"pandwind/css": "generated/pandwind/css/index.d.ts",
	"pandwind/design": "generated/pandwind/design/index.d.ts",
	"pandwind/tw": "generated/pandwind/tw/index.d.ts",
	"pandwind/cx": "generated/pandwind/cx/index.d.ts",
	"pandwind/preset": "generated/pandwind/preset/index.d.ts",
	"pandwind/types/typings": "generated/pandwind/types/typings.d.ts",
} as const;

const installedEditorModules = new Set(
	[
		...(dependencyTypeLibraries
			.find((library) => library.filePath.endsWith("/generated/dependencies/modules.d.ts"))
			?.content.matchAll(/declare module "([^"]+)"/g) ?? []),
	].map((match) => match[1]),
);

/** These are browser-only shims only for migration packages absent from the workspace graph. */
const migrationShimModules = [
	[
		"@pandwind/example-preset",
		String.raw`declare module "@pandwind/example-preset" {
  // This is a playground-only shim; the real preset is loaded by the browser evaluator.
  type PlaygroundConfig = {
    backgroundColor: string;
    borderRadius: string;
    color: string;
    display: string;
    fontSize: string;
    padding: string | number;
  };
  type PlaygroundProperties = {
    backgroundColor: true;
    borderRadius: true;
    color: true;
    display: true;
    fontSize: true;
    padding: true;
    $all: true;
  };
  type PlaygroundPreset = {
    conditions: {
      _active: string;
      _dark: string;
      _disabled: string;
      _focus: string;
      _hover: string;
      _light: string;
      _supportHover: string[];
      lg: string;
      lgDown: string;
      lgToXl: string;
      md: string;
      mdDown: string;
      mdToLarge: string;
      sm: string;
      smDown: string;
      smToMedium: string;
      xl: string;
    };
    properties: PlaygroundProperties;
    strict: false;
    _config: PlaygroundConfig;
    tokens: Record<string, Record<string, string>>;
  };
  export const examplePreset: PlaygroundPreset;
}`,
	],
	[
		"@pandacss/dev",
		String.raw`declare module "@pandacss/dev" { export function css(style: PlaygroundStyleObject): string; }`,
	],
	[
		"@emotion/css",
		String.raw`declare module "@emotion/css" { export function css(style: PlaygroundStyleObject): string; }`,
	],
	[
		"@emotion/react",
		String.raw`declare module "@emotion/react" { export function css(style: PlaygroundStyleObject): string; }`,
	],
	[
		"@compiled/react",
		String.raw`declare module "@compiled/react" { export function css(style: PlaygroundStyleObject): string; }`,
	],
	[
		"@vanilla-extract/css",
		String.raw`declare module "@vanilla-extract/css" { export function style(style: PlaygroundStyleObject): string; }`,
	],
	[
		"@treat/webpack",
		String.raw`declare module "@treat/webpack" { export function style(style: PlaygroundStyleObject): string; }`,
	],
	[
		"@tokenami/css",
		String.raw`declare module "@tokenami/css" { export function css(style: PlaygroundStyleObject): string; }`,
	],
	[
		"goober",
		String.raw`declare module "goober" { export function css(style: PlaygroundStyleObject): string; }`,
	],
	[
		"@stitches/react",
		String.raw`declare module "@stitches/react" {
  export function css(style: PlaygroundStyleObject): PlaygroundComponent;
}`,
	],
	[
		"react-jss",
		String.raw`declare module "react-jss" {
  export function createUseStyles<T extends Record<string, PlaygroundStyleObject>>(styles: T): () => T;
}`,
	],
	[
		"aphrodite",
		String.raw`declare module "aphrodite" {
  export const StyleSheet: {
    create<T extends Record<string, PlaygroundStyleObject>>(styles: T): T;
  };
}`,
	],
	[
		"style9",
		String.raw`declare module "style9" {
  const style9: {
    create<T extends Record<string, PlaygroundStyleObject>>(styles: T): T;
  };
  export default style9;
}`,
	],
	[
		"stylex",
		String.raw`declare module "stylex" {
  export function create<T extends Record<string, PlaygroundStyleObject>>(styles: T): T;
  export function props(...styles: readonly unknown[]): { className?: string };
}`,
	],
	[
		"@chakra-ui/react",
		String.raw`declare module "@chakra-ui/react" { export const Box: PlaygroundComponent; }`,
	],
	[
		"@mui/material",
		String.raw`declare module "@mui/material" { export const Box: PlaygroundComponent; }`,
	],
	[
		"@mantine/core",
		String.raw`declare module "@mantine/core" { export const Box: PlaygroundComponent; }`,
	],
	[
		"styled-components",
		String.raw`declare module "styled-components" {
  const styled: PlaygroundStyledFactory;
  export default styled;
  export const css: PlaygroundStyledFactory;
  export const keyframes: PlaygroundStyledFactory;
  export const ThemeProvider: PlaygroundComponent;
}`,
	],
	[
		"next-yak",
		String.raw`declare module "next-yak" { export const styled: PlaygroundStyledFactory; }`,
	],
	[
		"solid-styled-components",
		String.raw`declare module "solid-styled-components" { export const styled: PlaygroundStyledFactory; }`,
	],
	[
		"vue3-styled-components",
		String.raw`declare module "vue3-styled-components" {
  const styled: PlaygroundStyledFactory;
  export default styled;
}`,
	],
	[
		"react-fela",
		String.raw`declare module "react-fela" { export const RendererProvider: PlaygroundComponent; }`,
	],
] as const;

const migrationExampleModules = [
	String.raw`
type PlaygroundStyleObject = import("pandwind/types/typings").StyleObject;
type PlaygroundComponent<Props extends object = Record<string, unknown>> =
	(props?: Props) => JSX.Element;

declare module "react/jsx-runtime" {
  export function jsx(type: unknown, props: unknown): JSX.Element;
  export function jsxs(type: unknown, props: unknown): JSX.Element;
  export const Fragment: unknown;
}

interface PlaygroundStyledFactory {
  <Props extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...interpolations: readonly unknown[]
  ): PlaygroundComponent<Props>;
  <Props extends Record<string, unknown> = Record<string, unknown>>(
    component: PlaygroundComponent<Props>,
  ): PlaygroundStyledFactory;
  [tag: string]: PlaygroundStyledFactory;
}
`,
	...migrationShimModules
		.filter(([specifier]) => !installedEditorModules.has(specifier))
		.map(([, declaration]) => declaration),
].join("\n");

const globalEditorDeclarations = String.raw`
declare const tw: (styles: WindVariants) => string;
declare const css: import("pandwind/css").CssFn;
declare const cx: import("pandwind").CxFn;
declare const renderer: {
  renderRule(rule: (...args: readonly unknown[]) => PlaygroundStyleObject): string;
};

declare namespace JSX {
  interface Element {}
  type ElementType = string | ((props: any) => Element);
  interface ElementClass {}
  interface IntrinsicElements { [elementName: string]: Record<string, unknown>; }
}
declare namespace React {
  namespace JSX {
    interface Element {}
    type ElementType = string | ((props: any) => Element);
    interface IntrinsicElements { [elementName: string]: Record<string, unknown>; }
  }
}
`;

export interface EditorTypeLibrary {
	readonly filePath: string;
	readonly content: string;
}

/** Type libraries installed into Monaco's TypeScript worker before mount. */
export const EDITOR_TYPE_LIBRARIES: readonly EditorTypeLibrary[] = [
	...packageTypeLibraries,
	...dependencyTypeLibraries,
	{
		filePath: "file:///pandwind/playground/generated-types.d.ts",
		content: `${windTypes}\n${globalEditorDeclarations}`,
	},
	{
		filePath: "file:///pandwind/playground/modules.d.ts",
		content: migrationExampleModules,
	},
];
