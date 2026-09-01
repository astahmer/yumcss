// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseTooltipProps } from './use-tooltip.d.ts';
export interface TooltipRootBaseProps extends UseTooltipProps, UsePresenceProps {
}
export interface TooltipRootProps extends TooltipRootBaseProps {
    children?: ReactNode | undefined;
}
export declare const TooltipRoot: (props: TooltipRootProps) => import("react").JSX.Element;
