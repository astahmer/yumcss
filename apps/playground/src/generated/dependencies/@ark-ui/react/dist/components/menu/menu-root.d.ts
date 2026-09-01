// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseMenuProps } from './use-menu.d.ts';
export interface MenuRootBaseProps extends UseMenuProps, UsePresenceProps {
}
export interface MenuRootProps extends MenuRootBaseProps {
    children?: ReactNode | undefined;
}
export declare const MenuRoot: (props: MenuRootProps) => import("react").JSX.Element;
