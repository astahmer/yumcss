// Generated from the workspace-linked pandwind package. Do not edit.
import { type ConditionalValue } from "../../styled-system.d.ts";
import { type GridProps } from "../grid.d.ts";
interface SimpleGridBaseProps {
    /**
     * The width at which child elements will break into columns. Pass a number for pixel values or a string for any other valid CSS length.
     */
    minChildWidth?: GridProps["minWidth"] | undefined;
    /**
     * The number of columns
     */
    columns?: ConditionalValue<number> | undefined;
}
export interface SimpleGridProps extends Omit<GridProps, "columns">, SimpleGridBaseProps {
}
/**
 * SimpleGrid
 *
 * React component that uses the `Grid` component and provides
 * a simpler interface to create responsive grid layouts.
 *
 * Provides props that easily define columns and spacing.
 *
 * @see Docs https://chakra-ui.com/docs/components/simple-grid
 */
export declare const SimpleGrid: import("react").ForwardRefExoticComponent<SimpleGridProps & import("react").RefAttributes<HTMLDivElement>>;
export {};
