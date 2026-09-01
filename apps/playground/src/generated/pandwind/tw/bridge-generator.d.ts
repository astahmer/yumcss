// Generated from the workspace-linked pandwind package. Do not edit.
export type UtilityBridge = Record<string, Record<string, string>>;
/**
 * Default property allowlist: every CSS property the design surface and a
 * typical css() style object can express. Restricting the bridge to these
 * keeps the generated file small (values for unrelated properties like
 * `scroll-snap-*` or `accent-color` are never needed — their declarations
 * fall back to arbitrary property classes, which is always correct).
 */
export declare const BRIDGE_PROPS: readonly ["color", "background-color", "background", "background-image", "border-color", "border", "border-radius", "border-width", "border-style", "border-top", "border-right", "border-bottom", "border-left", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "border-top-style", "border-right-style", "border-bottom-style", "border-left-style", "padding", "padding-inline", "padding-block", "padding-top", "padding-right", "padding-bottom", "padding-left", "margin", "margin-inline", "margin-block", "margin-top", "margin-right", "margin-bottom", "margin-left", "width", "height", "min-width", "max-width", "min-height", "max-height", "display", "flex-direction", "flex-wrap", "justify-content", "align-items", "align-content", "gap", "column-gap", "row-gap", "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "text-transform", "text-decoration", "text-decoration-color", "text-decoration-line", "text-decoration-style", "text-decoration-thickness", "overflow", "overflow-x", "overflow-y", "text-overflow", "white-space", "opacity", "z-index", "position", "inset", "top", "right", "bottom", "left", "grid-auto-flow", "grid-template-columns", "grid-template-rows", "box-shadow", "filter", "backdrop-filter", "transform", "translate", "scale", "rotate", "outline", "outline-color", "outline-style", "outline-width", "outline-offset"];
export declare class UtilityBridgeGenerator {
    generate(entry: string, base: string, options?: {
        props?: readonly string[];
        values?: ReadonlySet<string>;
    }): Promise<UtilityBridge>;
}
