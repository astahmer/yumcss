// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { RootNode } from './use-environment-context.d.ts';
export interface EnvironmentProviderProps {
    children?: ReactNode | undefined;
    value?: RootNode | (() => RootNode) | undefined;
}
export declare const EnvironmentProvider: (props: EnvironmentProviderProps) => import("react").JSX.Element;
