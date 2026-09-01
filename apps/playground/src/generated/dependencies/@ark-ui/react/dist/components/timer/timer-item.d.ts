// Generated from the workspace-linked pandwind package. Do not edit.
import { ItemProps } from '@zag-js/timer';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface TimerItemBaseProps extends ItemProps, PolymorphicProps {
}
export interface TimerItemProps extends HTMLProps<'div'>, TimerItemBaseProps {
}
export declare const TimerItem: ForwardRefExoticComponent<TimerItemProps & RefAttributes<HTMLDivElement>>;
