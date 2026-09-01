// Generated from the workspace-linked pandwind package. Do not edit.
import { OptionItemProps } from '@zag-js/menu';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
type PartialOptionItemProps = Omit<OptionItemProps, 'type'>;
export interface MenuCheckboxItemBaseProps extends PartialOptionItemProps, PolymorphicProps {
}
export interface MenuCheckboxItemProps extends HTMLProps<'div'>, MenuCheckboxItemBaseProps {
}
export declare const MenuCheckboxItem: ForwardRefExoticComponent<MenuCheckboxItemProps & RefAttributes<HTMLDivElement>>;
export {};
