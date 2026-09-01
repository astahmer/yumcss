// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseTocProps } from './use-toc.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface TocRootBaseProps extends UseTocProps, PolymorphicProps {
}
export interface TocRootProps extends Assign<HTMLProps<'div'>, TocRootBaseProps> {
}
export declare const TocRoot: ForwardRefExoticComponent<TocRootProps & RefAttributes<HTMLDivElement>>;
