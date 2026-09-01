// Generated from the workspace-linked pandwind package. Do not edit.
import { TriggerProps } from '@zag-js/dialog';
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface DialogTriggerBaseProps extends TriggerProps, PolymorphicProps {
}
export interface DialogTriggerProps extends Assign<HTMLProps<'button'>, DialogTriggerBaseProps> {
}
export declare const DialogTrigger: ForwardRefExoticComponent<DialogTriggerProps & RefAttributes<HTMLButtonElement>>;
