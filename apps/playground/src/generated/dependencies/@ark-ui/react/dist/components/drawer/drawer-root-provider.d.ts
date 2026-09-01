// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { PolymorphicProps } from '../factory.d.ts';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseDrawerReturn } from './use-drawer.d.ts';
interface RootProviderProps {
    value: UseDrawerReturn;
}
export interface DrawerRootProviderBaseProps extends RootProviderProps, UsePresenceProps, PolymorphicProps {
}
export interface DrawerRootProviderProps extends DrawerRootProviderBaseProps {
    children?: ReactNode | undefined;
}
export declare const DrawerRootProvider: (props: DrawerRootProviderProps) => import("react").JSX.Element;
export {};
