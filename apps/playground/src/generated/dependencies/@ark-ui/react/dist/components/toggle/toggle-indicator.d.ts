// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLArkProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface ToggleIndicatorBaseProps {
    /**
     * The fallback content to render when the toggle is not pressed.
     */
    fallback?: React.ReactNode | undefined;
}
export interface ToggleIndicatorProps extends HTMLArkProps<'div'>, ToggleIndicatorBaseProps {
}
export declare const ToggleIndicator: ForwardRefExoticComponent<ToggleIndicatorProps & RefAttributes<HTMLDivElement>>;
