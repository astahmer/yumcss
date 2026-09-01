// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface FrameBaseProps {
    /** Additional content to be inserted into the frame's <head> */
    head?: React.ReactNode | undefined;
    /** Callback function to be executed when the frame is mounted */
    onMount?: (() => void) | undefined;
    /** Callback function to be executed when the frame is unmounted */
    onUnmount?: (() => void) | undefined;
}
export interface FrameProps extends Assign<React.IframeHTMLAttributes<HTMLIFrameElement>, FrameBaseProps> {
}
export declare const Frame: ForwardRefExoticComponent<FrameProps & RefAttributes<HTMLIFrameElement>>;
