// Generated from the workspace-linked pandwind package. Do not edit.
import type { InlineStylesMediaQuery } from '../../../InlineStyles.d.ts';
import type { ParseStylePropsResult } from './parse-style-props.d.ts';
export interface SortMediaQueriesResult extends Omit<ParseStylePropsResult, 'media'> {
    media: InlineStylesMediaQuery[];
}
export declare function sortMediaQueries({ media, ...props }: ParseStylePropsResult): SortMediaQueriesResult;
