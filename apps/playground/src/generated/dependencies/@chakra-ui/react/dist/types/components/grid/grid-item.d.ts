// Generated from the workspace-linked pandwind package. Do not edit.
import { type ConditionalValue, type SystemStyleObject } from "../../styled-system.d.ts";
import type { BoxProps } from "../box.d.ts";
export interface GridItemProps extends BoxProps {
    area?: SystemStyleObject["gridArea"] | undefined;
    colSpan?: ConditionalValue<number | "auto"> | undefined;
    colStart?: ConditionalValue<number | "auto"> | undefined;
    colEnd?: ConditionalValue<number | "auto"> | undefined;
    rowStart?: ConditionalValue<number | "auto"> | undefined;
    rowEnd?: ConditionalValue<number | "auto"> | undefined;
    rowSpan?: ConditionalValue<number | "auto"> | undefined;
}
export declare const GridItem: import("react").ForwardRefExoticComponent<GridItemProps & import("react").RefAttributes<HTMLDivElement>>;
