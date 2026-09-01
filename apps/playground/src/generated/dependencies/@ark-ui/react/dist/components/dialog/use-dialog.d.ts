// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as dialog from '@zag-js/dialog';
export interface UseDialogProps extends Optional<Omit<dialog.Props, 'getRootNode' | 'dir'>, 'id'> {
}
export interface UseDialogReturn extends dialog.Api<PropTypes> {
}
export declare const useDialog: (props?: UseDialogProps) => UseDialogReturn;
