// Generated from the workspace-linked pandwind package. Do not edit.
import { ItemProps } from '@zag-js/toggle-group';
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface ToggleGroupItemBaseProps extends ItemProps, PolymorphicProps {
}
export interface ToggleGroupItemProps extends Assign<HTMLProps<'button'>, ToggleGroupItemBaseProps> {
}
export declare const ToggleGroupItem: ForwardRefExoticComponent<ToggleGroupItemProps & RefAttributes<HTMLButtonElement>>;
