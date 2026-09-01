// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseHoverCardProps } from './use-hover-card.d.ts';
export interface HoverCardRootBaseProps extends UseHoverCardProps, UsePresenceProps {
}
export interface HoverCardRootProps extends HoverCardRootBaseProps {
    children?: ReactNode | undefined;
}
export declare const HoverCardRoot: (props: HoverCardRootProps) => import("react").JSX.Element;
