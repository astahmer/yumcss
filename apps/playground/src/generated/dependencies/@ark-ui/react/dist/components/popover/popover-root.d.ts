// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UsePopoverProps } from './use-popover.d.ts';
export interface PopoverRootBaseProps extends UsePopoverProps, UsePresenceProps {
}
export interface PopoverRootProps extends PopoverRootBaseProps {
    children?: ReactNode | undefined;
}
export declare const PopoverRoot: (props: PopoverRootProps) => import("react").JSX.Element;
