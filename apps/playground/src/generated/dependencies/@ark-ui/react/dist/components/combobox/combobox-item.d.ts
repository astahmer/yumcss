// Generated from the workspace-linked pandwind package. Do not edit.
import { ItemProps } from '@zag-js/combobox';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface ComboboxItemBaseProps extends ItemProps, PolymorphicProps {
}
export interface ComboboxItemProps extends HTMLProps<'div'>, ComboboxItemBaseProps {
}
export declare const ComboboxItem: ForwardRefExoticComponent<ComboboxItemProps & RefAttributes<HTMLDivElement>>;
