// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseHoverCardReturn } from './use-hover-card.d.ts';
interface RootProviderProps {
    value: UseHoverCardReturn;
}
export interface HoverCardRootProviderBaseProps extends RootProviderProps, UsePresenceProps {
}
export interface HoverCardRootProviderProps extends HoverCardRootProviderBaseProps {
    children?: ReactNode | undefined;
}
export declare const HoverCardRootProvider: (props: HoverCardRootProviderProps) => import("react").JSX.Element;
export {};
