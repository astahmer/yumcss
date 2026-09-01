// Generated from the workspace-linked pandwind package. Do not edit.
import { RenderStrategyProps } from '../../utils/render-strategy.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseAccordionReturn } from './use-accordion.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseAccordionReturn;
}
export interface AccordionRootProviderBaseProps extends RootProviderProps, RenderStrategyProps, PolymorphicProps {
}
export interface AccordionRootProviderProps extends HTMLProps<'div'>, AccordionRootProviderBaseProps {
}
export declare const AccordionRootProvider: ForwardRefExoticComponent<AccordionRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
