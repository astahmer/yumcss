// Generated from the workspace-linked pandwind package. Do not edit.
import { ItemProps } from '@zag-js/navigation-menu';
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface NavigationMenuTriggerBaseProps extends Omit<ItemProps, 'value'>, PolymorphicProps {
}
export interface NavigationMenuTriggerProps extends Assign<HTMLProps<'button'>, NavigationMenuTriggerBaseProps> {
}
export declare const NavigationMenuTrigger: ForwardRefExoticComponent<NavigationMenuTriggerProps & RefAttributes<HTMLButtonElement>>;
