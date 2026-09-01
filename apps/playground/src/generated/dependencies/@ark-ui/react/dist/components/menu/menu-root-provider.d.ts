// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseMenuReturn } from './use-menu.d.ts';
interface RootProviderProps {
    value: UseMenuReturn;
}
export interface MenuRootProviderBaseProps extends RootProviderProps, UsePresenceProps {
}
export interface MenuRootProviderProps extends MenuRootProviderBaseProps {
    children?: ReactNode | undefined;
}
export declare const MenuRootProvider: (props: MenuRootProviderProps) => import("react").JSX.Element;
export {};
