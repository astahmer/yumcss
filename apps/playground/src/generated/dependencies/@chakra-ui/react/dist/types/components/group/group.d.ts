// Generated from the workspace-linked pandwind package. Do not edit.
import { type HTMLChakraProps, type InferRecipeProps, type JsxStyleProps } from "../../styled-system.d.ts";
declare const StyledGroup: import("../...d.ts").ChakraComponent<"div", {
    orientation?: import("../...d.ts").ConditionalValue<"horizontal" | "vertical" | undefined>;
    attached?: import("../...d.ts").ConditionalValue<boolean | undefined>;
    grow?: import("../...d.ts").ConditionalValue<boolean | undefined>;
    stacking?: import("../...d.ts").ConditionalValue<"first-on-top" | "last-on-top" | undefined>;
}>;
type VariantProps = InferRecipeProps<typeof StyledGroup>;
export interface GroupProps extends HTMLChakraProps<"div", VariantProps> {
    /**
     * The `alignItems` style property
     */
    align?: JsxStyleProps["alignItems"] | undefined;
    /**
     * The `justifyContent` style property
     */
    justify?: JsxStyleProps["justifyContent"] | undefined;
    /**
     * The `flexWrap` style property
     */
    wrap?: JsxStyleProps["flexWrap"] | undefined;
    /**
     * A function that determines if a child should be skipped
     */
    skip?: (child: React.ReactElement) => boolean | undefined;
}
export declare const Group: import("react").NamedExoticComponent<GroupProps & import("react").RefAttributes<HTMLDivElement>>;
export {};
