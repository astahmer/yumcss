// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as hoverCard from '@zag-js/hover-card';
export interface UseHoverCardProps extends Optional<Omit<hoverCard.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseHoverCardReturn extends hoverCard.Api<PropTypes> {
}
export declare const useHoverCard: (props?: UseHoverCardProps) => UseHoverCardReturn;
