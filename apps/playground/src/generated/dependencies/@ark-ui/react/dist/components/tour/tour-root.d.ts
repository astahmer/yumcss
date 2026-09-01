// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { UsePresenceProps } from '../presence/index.d.ts';
import { UseTourReturn } from './use-tour.d.ts';
export interface TourRootBaseProps extends UsePresenceProps {
    tour: UseTourReturn;
}
export interface TourRootProps extends TourRootBaseProps {
    children?: ReactNode | undefined;
}
export declare const TourRoot: (props: TourRootProps) => import("react").JSX.Element;
