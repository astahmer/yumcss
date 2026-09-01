// Generated from the workspace-linked pandwind package. Do not edit.
import { TriggerProps } from '@zag-js/drawer';
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface DrawerTriggerBaseProps extends TriggerProps, PolymorphicProps {
}
export interface DrawerTriggerProps extends Assign<HTMLProps<'button'>, DrawerTriggerBaseProps> {
}
export declare const DrawerTrigger: ForwardRefExoticComponent<DrawerTriggerProps & RefAttributes<HTMLButtonElement>>;
