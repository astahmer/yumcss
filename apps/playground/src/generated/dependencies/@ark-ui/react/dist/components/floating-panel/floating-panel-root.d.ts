// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseFloatingPanelProps } from './use-floating-panel.d.ts';
export interface FloatingPanelRootBaseProps extends UseFloatingPanelProps, UsePresenceProps {
}
export interface FloatingPanelRootProps extends FloatingPanelRootBaseProps {
    children?: ReactNode | undefined;
}
export declare const FloatingPanelRoot: (props: FloatingPanelRootProps) => import("react").JSX.Element;
