import generatedWindTypes from "../types.d.ts?raw";

/**
 * Monaco's TypeScript worker is separate from the Vite/TypeScript compiler.
 * Keep its design-system vocabulary sourced from the same generated artifact
 * that types the real playground module, then add only the browser-facing
 * ambient modules needed by migration examples.
 */
const windTypes = generatedWindTypes.replace("export type WindVariants", "type WindVariants");

const sharedDeclarations = String.raw`
type PlaygroundStylePrimitive = string | number | boolean | null | undefined;
type PlaygroundStyleObject = Record<string, PlaygroundStylePrimitive | PlaygroundStyleObject>;
type PlaygroundClassInput =
  | string
  | Record<string, string>
  | false
  | null
  | undefined
  | PlaygroundClassInput[];

interface PlaygroundCss {
  (style: PlaygroundStyleObject): string;
  class(...styles: PlaygroundStyleObject[]): string;
  raw(...styles: PlaygroundStyleObject[]): PlaygroundStyleObject;
  props(...styles: PlaygroundStyleObject[]): { className?: string; style?: Record<string, string> };
}

declare const tw: (styles: WindVariants) => string;
declare const css: PlaygroundCss;
declare const cx: (...inputs: PlaygroundClassInput[]) => string;

declare namespace JSX {
  interface Element {}
  type ElementType = string | ((props?: Record<string, unknown>) => Element);
  interface ElementClass {}
  interface IntrinsicElements {
    [elementName: string]: Record<string, unknown>;
  }
}

declare namespace React {
  namespace JSX {
    interface Element {}
    type ElementType = string | ((props?: Record<string, unknown>) => Element);
    interface IntrinsicElements {
      [elementName: string]: Record<string, unknown>;
    }
  }
}

type PlaygroundComponent<Props extends Record<string, unknown> = Record<string, unknown>> =
  (props?: Props) => JSX.Element;

declare const renderer: {
  renderRule(rule: (...args: readonly unknown[]) => PlaygroundStyleObject): string;
};
`;

const moduleDeclarations = String.raw`
declare module "pandwind/tw" {
  export interface TwOptions {
    variants?: Record<string, { join?: string }>;
    conflicts?: Record<string, unknown>;
    compose?: readonly string[];
  }
  export function createTw<T = WindVariants>(options?: TwOptions): (styles: T) => string;
  export function tw(styles: WindVariants): string;
}

declare module "pandwind/css" {
  export function createCss<T extends PlaygroundStyleObject = PlaygroundStyleObject>(): PlaygroundCss;
}

declare module "pandwind/design" {
  export function createDesignCss<T extends PlaygroundStyleObject = PlaygroundStyleObject>(
    preset?: unknown,
  ): PlaygroundCss;
}

declare module "react/jsx-runtime" {
  export function jsx(type: unknown, props: unknown): JSX.Element;
  export function jsxs(type: unknown, props: unknown): JSX.Element;
  export const Fragment: unknown;
  export namespace JSX {
    interface Element {}
    type ElementType = string | ((props?: Record<string, unknown>) => Element);
    interface IntrinsicElements {
      [elementName: string]: Record<string, unknown>;
    }
  }
}

declare module "@pandacss/dev" {
  export function css(style: PlaygroundStyleObject): string;
}

declare module "@emotion/css" {
  export function css(style: PlaygroundStyleObject): string;
}

declare module "@emotion/react" {
  export function css(style: PlaygroundStyleObject): string;
}

declare module "@compiled/react" {
  export function css(style: PlaygroundStyleObject): string;
}

declare module "@vanilla-extract/css" {
  export function style(style: PlaygroundStyleObject): string;
}

declare module "@treat/webpack" {
  export function style(style: PlaygroundStyleObject): string;
}

declare module "@tokenami/css" {
  export function css(style: PlaygroundStyleObject): string;
}

declare module "goober" {
  export function css(style: PlaygroundStyleObject): string;
}

declare module "@stitches/react" {
  export function css(style: PlaygroundStyleObject): PlaygroundComponent;
}

declare module "react-jss" {
  export function createUseStyles<T extends Record<string, PlaygroundStyleObject>>(
    styles: T,
  ): () => T;
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

declare module "@chakra-ui/react" {
  export const Box: PlaygroundComponent;
}

declare module "@mui/material" {
  export const Box: PlaygroundComponent;
}

declare module "@mantine/core" {
  export const Box: PlaygroundComponent;
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

declare module "styled-components" {
  const styled: PlaygroundStyledFactory;
  export default styled;
  export const css: PlaygroundStyledFactory;
  export const keyframes: PlaygroundStyledFactory;
  export const ThemeProvider: PlaygroundComponent;
}

declare module "next-yak" {
  export const styled: PlaygroundStyledFactory;
}

declare module "solid-styled-components" {
  export const styled: PlaygroundStyledFactory;
}

declare module "vue3-styled-components" {
  const styled: PlaygroundStyledFactory;
  export default styled;
}

declare module "react-fela" {
  export const RendererProvider: PlaygroundComponent;
}
`;

export interface EditorTypeLibrary {
	readonly filePath: string;
	readonly content: string;
}

/** Type libraries installed into Monaco's TypeScript worker before mount. */
export const EDITOR_TYPE_LIBRARIES: readonly EditorTypeLibrary[] = [
	{
		filePath: "file:///pandwind/playground/generated-types.d.ts",
		content: `${windTypes}\n${sharedDeclarations}`,
	},
	{
		filePath: "file:///pandwind/playground/modules.d.ts",
		content: moduleDeclarations,
	},
];
