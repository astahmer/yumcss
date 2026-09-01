// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseDrawerProps } from './use-drawer.d.ts';
export interface DrawerRootBaseProps extends UseDrawerProps, UsePresenceProps {
}
export interface DrawerRootProps extends DrawerRootBaseProps {
    children?: ReactNode | undefined;
}
export declare const DrawerRoot: (props: DrawerRootProps) => import("react").JSX.Element;
