// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseSplitterProps } from './use-splitter.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface SplitterRootBaseProps extends UseSplitterProps, PolymorphicProps {
}
export interface SplitterRootProps extends Assign<HTMLProps<'div'>, SplitterRootBaseProps> {
}
export declare const SplitterRoot: ForwardRefExoticComponent<SplitterRootProps & RefAttributes<HTMLDivElement>>;
