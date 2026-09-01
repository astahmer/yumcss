// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { RenderStrategyProps } from '../../utils/render-strategy.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseAccordionProps } from './use-accordion.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface AccordionRootBaseProps extends UseAccordionProps, RenderStrategyProps, PolymorphicProps {
}
export interface AccordionRootProps extends Assign<HTMLProps<'div'>, AccordionRootBaseProps> {
}
export declare const AccordionRoot: ForwardRefExoticComponent<AccordionRootProps & RefAttributes<HTMLDivElement>>;
