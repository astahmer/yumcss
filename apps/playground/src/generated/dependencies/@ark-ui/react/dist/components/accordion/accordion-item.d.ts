// Generated from the workspace-linked pandwind package. Do not edit.
import { ItemProps } from '@zag-js/accordion';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface AccordionItemBaseProps extends ItemProps, PolymorphicProps {
}
export interface AccordionItemProps extends HTMLProps<'div'>, AccordionItemBaseProps {
}
export declare const AccordionItem: ForwardRefExoticComponent<AccordionItemProps & RefAttributes<HTMLDivElement>>;
