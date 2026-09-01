// Generated from the workspace-linked pandwind package. Do not edit.
import { ItemProps } from '@zag-js/pagination';
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface PaginationItemBaseProps extends ItemProps, PolymorphicProps {
}
export interface PaginationItemProps extends Assign<HTMLProps<'button'>, PaginationItemBaseProps> {
}
export declare const PaginationItem: ForwardRefExoticComponent<PaginationItemProps & RefAttributes<HTMLButtonElement>>;
