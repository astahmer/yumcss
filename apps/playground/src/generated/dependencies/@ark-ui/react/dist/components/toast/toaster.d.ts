// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode, ForwardRefExoticComponent, RefAttributes } from 'react';
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { CreateToasterReturn } from './create-toaster.d.ts';
import * as toast from '@zag-js/toast';
export type ToastOptions = toast.Options<ReactNode>;
export interface ToasterBaseProps extends PolymorphicProps, Omit<toast.GroupProps, 'store' | 'id'> {
    toaster: CreateToasterReturn<any>;
    children: (toast: ToastOptions) => ReactNode;
}
export interface ToasterProps extends Assign<HTMLProps<'div'>, ToasterBaseProps> {
}
export declare const Toaster: ForwardRefExoticComponent<ToasterProps & RefAttributes<HTMLDivElement>>;
