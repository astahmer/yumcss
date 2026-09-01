// Generated from the workspace-linked pandwind package. Do not edit.
import { type HTMLChakraProps } from "../../styled-system.d.ts";
export interface AbsoluteCenterProps extends HTMLChakraProps<"div"> {
    axis?: "horizontal" | "vertical" | "both" | undefined;
}
/**
 * React component used to horizontally and vertically center an element
 * relative to its parent dimensions.
 *
 * It uses the `position: absolute` strategy.
 *
 * @see Docs https://chakra-ui.com/components/center
 */
export declare const AbsoluteCenter: import("../...d.ts").ChakraComponent<"div", {
    axis?: import("../...d.ts").ConditionalValue<"both" | "horizontal" | "vertical" | undefined>;
}>;
