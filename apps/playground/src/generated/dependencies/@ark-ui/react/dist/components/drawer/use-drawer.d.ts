// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as drawer from '@zag-js/drawer';
export interface UseDrawerProps extends Optional<Omit<drawer.Props, 'dir' | 'getRootNode' | 'defaultSnapPoint'>, 'id'> {
    defaultSnapPoint?: drawer.SnapPoint | undefined;
}
export interface UseDrawerReturn extends drawer.Api<PropTypes> {
}
export declare const useDrawer: (props?: UseDrawerProps) => UseDrawerReturn;
