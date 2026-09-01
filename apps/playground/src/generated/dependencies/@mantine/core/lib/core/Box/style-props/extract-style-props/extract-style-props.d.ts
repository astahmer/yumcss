// Generated from the workspace-linked pandwind package. Do not edit.
import type { MantineStyleProps } from '../style-props.types.d.ts';
export declare function extractStyleProps<T extends Record<string, any>>(others: MantineStyleProps & T): {
    styleProps: MantineStyleProps & {
        sx?: any;
    };
    rest: T;
};
