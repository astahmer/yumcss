// Generated from the workspace-linked pandwind package. Do not edit.
import { Point } from './types.d.ts';
import '@zag-js/types';

interface PercentValueOptions {
    inverted?: boolean | {
        x?: boolean | undefined;
        y?: boolean | undefined;
    } | undefined;
    dir?: "ltr" | "rtl" | undefined;
    orientation?: "vertical" | "horizontal" | undefined;
}
declare function getRelativePoint(point: Point, element: HTMLElement): {
    offset: {
        x: number;
        y: number;
    };
    percent: {
        x: number;
        y: number;
    };
    getPercentValue: (options?: PercentValueOptions) => number;
};

export { type PercentValueOptions, getRelativePoint };
