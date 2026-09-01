// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseProgressProps } from './use-progress.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface ProgressRootBaseProps extends UseProgressProps, PolymorphicProps {
}
export interface ProgressRootProps extends Assign<HTMLProps<'div'>, ProgressRootBaseProps> {
}
export declare const ProgressRoot: ForwardRefExoticComponent<ProgressRootProps & RefAttributes<HTMLDivElement>>;
