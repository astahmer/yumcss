// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode, ForwardRefExoticComponent, RefAttributes } from 'react';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
export interface MarqueeContentBaseProps extends PolymorphicProps {
    children: ReactNode;
}
export interface MarqueeContentProps extends Omit<HTMLProps<'div'>, 'children'>, MarqueeContentBaseProps {
}
export declare const MarqueeContent: ForwardRefExoticComponent<MarqueeContentProps & RefAttributes<HTMLDivElement>>;
