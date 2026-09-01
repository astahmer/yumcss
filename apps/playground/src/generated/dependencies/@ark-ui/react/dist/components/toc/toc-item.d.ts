// Generated from the workspace-linked pandwind package. Do not edit.
import { ItemProps } from '@zag-js/toc';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface TocItemBaseProps extends ItemProps, PolymorphicProps {
}
export interface TocItemProps extends HTMLProps<'li'>, TocItemBaseProps {
}
export declare const TocItem: ForwardRefExoticComponent<TocItemProps & RefAttributes<HTMLLIElement>>;
