// Generated from the workspace-linked pandwind package. Do not edit.
import { type BoxProps } from "../box.d.ts";
export interface SquareProps extends BoxProps {
    /**
     * The size (width and height) of the square
     */
    size?: BoxProps["boxSize"] | undefined;
}
export declare const Square: import("react").ForwardRefExoticComponent<SquareProps & import("react").RefAttributes<HTMLDivElement>>;
