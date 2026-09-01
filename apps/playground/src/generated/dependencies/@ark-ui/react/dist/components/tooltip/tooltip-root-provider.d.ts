// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseTooltipReturn } from './use-tooltip.d.ts';
interface RootProviderProps {
    value: UseTooltipReturn;
}
export interface TooltipRootProviderBaseProps extends RootProviderProps, UsePresenceProps {
}
export interface TooltipRootProviderProps extends TooltipRootProviderBaseProps {
    children?: ReactNode | undefined;
}
export declare const TooltipRootProvider: (props: TooltipRootProviderProps) => import("react").JSX.Element;
export {};
