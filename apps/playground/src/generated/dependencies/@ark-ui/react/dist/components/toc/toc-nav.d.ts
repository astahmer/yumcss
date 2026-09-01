// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface TocNavBaseProps extends PolymorphicProps {
    placement?: 'left' | 'right';
}
export interface TocNavProps extends HTMLProps<'nav'>, TocNavBaseProps {
}
export declare const TocNav: ForwardRefExoticComponent<TocNavProps & RefAttributes<HTMLElement>>;
