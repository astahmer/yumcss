// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UsePopoverReturn } from './use-popover.d.ts';
interface RootProviderProps {
    value: UsePopoverReturn;
}
export interface PopoverRootProviderBaseProps extends RootProviderProps, UsePresenceProps {
}
export interface PopoverRootProviderProps extends PopoverRootProviderBaseProps {
    children?: ReactNode | undefined;
}
export declare const PopoverRootProvider: (props: PopoverRootProviderProps) => import("react").JSX.Element;
export {};
