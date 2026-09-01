// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode, ForwardRefExoticComponent, RefAttributes } from 'react';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
export interface ClipboardIndicatorBaseProps extends PolymorphicProps {
    copied?: ReactNode | undefined;
}
export interface ClipboardIndicatorProps extends HTMLProps<'div'>, ClipboardIndicatorBaseProps {
}
export declare const ClipboardIndicator: ForwardRefExoticComponent<ClipboardIndicatorProps & RefAttributes<HTMLDivElement>>;
