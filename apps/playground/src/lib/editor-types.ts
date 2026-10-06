const generatedWindTypes = String(
	import.meta.glob("../types.d.ts", { eager: true, import: "default", query: "?raw" })[
		"../types.d.ts"
	] ?? "",
);
const windTypes = generatedWindTypes.replace("export type WindVariants", "type WindVariants");

const generatedYumCSSTypes = import.meta.glob("../generated/yumcss/**/*.d.ts", {
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

const packageTypeLibraries = Object.entries(generatedYumCSSTypes).map(([path, content]) => ({
	filePath: `file:///yumcss/playground/generated/yumcss/${path.replace("../generated/yumcss/", "")}`,
	content: String(content),
}));

const dependencyTypeLibraries = Object.entries(generatedDependencyTypes).map(([path, content]) => ({
	filePath: `file:///yumcss/playground/generated/dependencies/${path.replace("../generated/dependencies/", "")}`,
	content: String(content),
}));

/**
 * Monaco's TypeScript worker has no access to the host filesystem. The
 * declaration graph is generated from the workspace-linked `yumcss`
 * package before dev/build, then mounted under a virtual package tree here.
 * Relative imports are redirected to emitted declarations so the editor uses
 * the same `CssFn`, `CxFn`, design types, and option contracts as the package.
 */
/** TypeScript paths for every YumCSS public module used by the playground. */
export const YUMCSS_EDITOR_MODULE_PATHS = {
	yumcss: "generated/yumcss/index.d.ts",
	"yumcss/css": "generated/yumcss/css/index.d.ts",
	"yumcss/unsafe/css": "generated/yumcss/unsafe/css.d.ts",
	"yumcss/design": "generated/yumcss/design/index.d.ts",
	"yumcss/tw": "generated/yumcss/tw/index.d.ts",
	"yumcss/cx": "generated/yumcss/cx/index.d.ts",
	"yumcss/preset": "generated/yumcss/preset/index.d.ts",
	"yumcss/preset/csstype": "generated/yumcss/preset/csstype.d.ts",
	"yumcss/preset/default": "generated/yumcss/preset/default.d.ts",
	"yumcss/types/typings": "generated/yumcss/types/typings.d.ts",
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
		"@yumcss/example-preset",
		String.raw`declare module "@yumcss/example-preset" {
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
type PlaygroundStyleObject = import("yumcss/types/typings").StyleObject;
type PlaygroundComponent<Props extends object = Record<string, unknown>> =
	(props: Props) => React.JSX.Element;

declare module "react/jsx-runtime" {
  export function jsx(type: React.JSX.ElementType, props: unknown, key?: React.Key): React.JSX.Element;
  export function jsxs(type: React.JSX.ElementType, props: unknown, key?: React.Key): React.JSX.Element;
  export const Fragment: React.JSXElementConstructor<{ children?: React.ReactNode }>;
}

declare module "react/jsx-dev-runtime" {
  export function jsxDEV(
    type: React.JSX.ElementType,
    props: unknown,
    key: React.Key | undefined,
    isStaticChildren: boolean,
    source: unknown,
    self: unknown,
  ): React.JSX.Element;
  export const Fragment: React.JSXElementConstructor<{ children?: React.ReactNode }>;
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
declare const css: import("yumcss/css").CssFn;
declare const cx: import("yumcss").CxFn;
declare const renderer: {
  renderRule(rule: (...args: readonly unknown[]) => PlaygroundStyleObject): string;
};

declare namespace JSX {
  type Element = React.JSX.Element;
  type ElementType = React.JSX.ElementType;
  interface ElementClass extends React.JSX.ElementClass {}
  interface IntrinsicElements extends React.JSX.IntrinsicElements {}
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
		filePath: "file:///yumcss/playground/generated-types.d.ts",
		content: `${windTypes}\n${globalEditorDeclarations}`,
	},
	{
		filePath: "file:///yumcss/playground/modules.d.ts",
		content: migrationExampleModules,
	},
];
