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

const generatedDependencyTypes = import.meta.glob("../generated/dependencies/**/*.d.ts", {
	eager: true,
	import: "default",
	query: "?raw",
});

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
const pandwindModules = String.raw`
declare module "pandwind" {
  export * from "./generated/pandwind/index.d.ts";
}
declare module "pandwind/css" {
  export * from "./generated/pandwind/css/index.d.ts";
}
declare module "pandwind/design" {
  export * from "./generated/pandwind/design/index.d.ts";
}
declare module "pandwind/tw" {
  export * from "./generated/pandwind/tw/index.d.ts";
}
declare module "pandwind/cx" {
  export * from "./generated/pandwind/cx/index.d.ts";
}
declare module "pandwind/types/typings" {
  export * from "./generated/pandwind/types/typings.d.ts";
}
`;

/** These are browser-only shims for migration examples whose packages are not playground dependencies. */
const migrationExampleModules = String.raw`
type PlaygroundStyleObject = import("pandwind/types/typings").StyleObject;
type PlaygroundComponent<Props extends Record<string, unknown> = Record<string, unknown>> =
  (props?: Props) => JSX.Element;

declare module "react/jsx-runtime" {
  export function jsx(type: unknown, props: unknown): JSX.Element;
  export function jsxs(type: unknown, props: unknown): JSX.Element;
  export const Fragment: unknown;
}

declare module "@pandacss/dev" { export function css(style: PlaygroundStyleObject): string; }
declare module "@emotion/css" { export function css(style: PlaygroundStyleObject): string; }
declare module "@emotion/react" { export function css(style: PlaygroundStyleObject): string; }
declare module "@compiled/react" { export function css(style: PlaygroundStyleObject): string; }
declare module "@vanilla-extract/css" { export function style(style: PlaygroundStyleObject): string; }
declare module "@treat/webpack" { export function style(style: PlaygroundStyleObject): string; }
declare module "@tokenami/css" { export function css(style: PlaygroundStyleObject): string; }
declare module "goober" { export function css(style: PlaygroundStyleObject): string; }
declare module "@stitches/react" {
  export function css(style: PlaygroundStyleObject): PlaygroundComponent;
}
declare module "react-jss" {
  export function createUseStyles<T extends Record<string, PlaygroundStyleObject>>(styles: T): () => T;
}
declare module "aphrodite" {
  export const StyleSheet: {
    create<T extends Record<string, PlaygroundStyleObject>>(styles: T): T;
  };
}
declare module "style9" {
  const style9: {
    create<T extends Record<string, PlaygroundStyleObject>>(styles: T): T;
  };
  export default style9;
}
declare module "stylex" {
  export function create<T extends Record<string, PlaygroundStyleObject>>(styles: T): T;
  export function props(...styles: readonly unknown[]): { className?: string };
}
declare module "@chakra-ui/react" { export const Box: PlaygroundComponent; }
declare module "@mui/material" { export const Box: PlaygroundComponent; }
declare module "@mantine/core" { export const Box: PlaygroundComponent; }

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
declare module "styled-components" {
  const styled: PlaygroundStyledFactory;
  export default styled;
  export const css: PlaygroundStyledFactory;
  export const keyframes: PlaygroundStyledFactory;
  export const ThemeProvider: PlaygroundComponent;
}
declare module "next-yak" { export const styled: PlaygroundStyledFactory; }
declare module "solid-styled-components" { export const styled: PlaygroundStyledFactory; }
declare module "vue3-styled-components" {
  const styled: PlaygroundStyledFactory;
  export default styled;
}
declare module "react-fela" { export const RendererProvider: PlaygroundComponent; }
`;

const globalEditorDeclarations = String.raw`
declare const tw: (styles: WindVariants) => string;
declare const css: import("pandwind/css").CssFn;
declare const cx: import("pandwind").CxFn;
declare const renderer: {
  renderRule(rule: (...args: readonly unknown[]) => PlaygroundStyleObject): string;
};

declare namespace JSX {
  interface Element {}
  type ElementType = string | ((props?: Record<string, unknown>) => Element);
  interface ElementClass {}
  interface IntrinsicElements { [elementName: string]: Record<string, unknown>; }
}
declare namespace React {
  namespace JSX {
    interface Element {}
    type ElementType = string | ((props?: Record<string, unknown>) => Element);
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
		content: `${pandwindModules}\n${migrationExampleModules}`,
	},
];
