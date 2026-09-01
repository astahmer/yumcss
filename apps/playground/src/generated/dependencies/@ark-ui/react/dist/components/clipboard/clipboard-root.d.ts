// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseClipboardProps } from './use-clipboard.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface ClipboardRootBaseProps extends UseClipboardProps, PolymorphicProps {
}
export interface ClipboardRootProps extends Assign<HTMLProps<'div'>, ClipboardRootBaseProps> {
}
export declare const ClipboardRoot: ForwardRefExoticComponent<ClipboardRootProps & RefAttributes<HTMLDivElement>>;
