// Generated from the workspace-linked pandwind package. Do not edit.
import { ContentProps } from '@zag-js/navigation-menu';
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface NavigationMenuContentBaseProps extends Partial<ContentProps>, PolymorphicProps {
}
export interface NavigationMenuContentProps extends Assign<HTMLProps<'div'>, NavigationMenuContentBaseProps> {
}
export declare const NavigationMenuContent: ForwardRefExoticComponent<NavigationMenuContentProps & RefAttributes<HTMLDivElement>>;
