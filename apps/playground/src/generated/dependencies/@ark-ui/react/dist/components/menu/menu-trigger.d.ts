// Generated from the workspace-linked pandwind package. Do not edit.
import { TriggerProps } from '@zag-js/menu';
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface MenuTriggerBaseProps extends TriggerProps, PolymorphicProps {
}
export interface MenuTriggerProps extends Assign<HTMLProps<'button'>, MenuTriggerBaseProps> {
}
export declare const MenuTrigger: ForwardRefExoticComponent<MenuTriggerProps & RefAttributes<HTMLButtonElement>>;
