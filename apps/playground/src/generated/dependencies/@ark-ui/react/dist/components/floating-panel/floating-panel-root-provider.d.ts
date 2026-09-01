// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseFloatingPanelReturn } from './use-floating-panel.d.ts';
interface RootProviderProps {
    value: UseFloatingPanelReturn;
}
export interface FloatingPanelRootProviderBaseProps extends RootProviderProps, Omit<UsePresenceProps, 'present'> {
}
export interface FloatingPanelRootProviderProps extends FloatingPanelRootProviderBaseProps {
    children?: ReactNode | undefined;
}
export declare const FloatingPanelRootProvider: (props: FloatingPanelRootProviderProps) => import("react").JSX.Element;
export {};
