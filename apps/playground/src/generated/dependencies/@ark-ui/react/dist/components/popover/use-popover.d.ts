// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as popover from '@zag-js/popover';
export interface UsePopoverProps extends Optional<Omit<popover.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UsePopoverReturn extends popover.Api<PropTypes> {
}
export declare const usePopover: (props?: UsePopoverProps) => UsePopoverReturn;
