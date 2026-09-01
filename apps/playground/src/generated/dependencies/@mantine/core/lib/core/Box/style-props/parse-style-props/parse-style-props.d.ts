// Generated from the workspace-linked pandwind package. Do not edit.
import { MantineTheme } from '../../../MantineProvider.d.ts';
import type { SystemPropData } from '../style-props-data.d.ts';
import type { StyleProp } from '../style-props.types.d.ts';
import { SortMediaQueriesResult } from './sort-media-queries.d.ts';
interface ParseStylePropsOptions {
    styleProps: Record<string, StyleProp<any>>;
    theme: MantineTheme;
    data: Record<string, SystemPropData>;
}
export interface ParseStylePropsResult {
    hasResponsiveStyles: boolean;
    inlineStyles: React.CSSProperties;
    styles: React.CSSProperties;
    media: Record<string, React.CSSProperties>;
}
export declare function parseStyleProps({ styleProps, data, theme, }: ParseStylePropsOptions): SortMediaQueriesResult;
export {};
