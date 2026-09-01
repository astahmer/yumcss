// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import { HideMode, RenderStrategyProps } from '../../utils/render-strategy.d.ts';
import * as collapsible from '@zag-js/collapsible';
export interface UseCollapsibleProps extends Optional<Omit<collapsible.Props, 'dir' | 'getRootNode'>, 'id'>, RenderStrategyProps {
}
export interface UseCollapsibleReturn extends collapsible.Api<PropTypes> {
    /**
     * Whether the content is unmounted
     */
    isUnmounted?: boolean | undefined;
    /**
     * Resolved hide strategy for mounted content.
     */
    hideMode: HideMode;
}
export declare const useCollapsible: (props?: UseCollapsibleProps) => UseCollapsibleReturn;
