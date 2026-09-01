// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as floatingPanel from '@zag-js/floating-panel';
export interface UseFloatingPanelProps extends Optional<Omit<floatingPanel.Props, 'getRootNode'>, 'id'> {
}
export interface UseFloatingPanelReturn extends floatingPanel.Api<PropTypes> {
}
export declare const useFloatingPanel: (props?: UseFloatingPanelProps) => UseFloatingPanelReturn;
