// Generated from the workspace-linked pandwind package. Do not edit.
import { PanelProps } from '@zag-js/splitter';
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface SplitterPanelBaseProps extends PanelProps, PolymorphicProps {
}
export interface SplitterPanelProps extends Assign<HTMLProps<'div'>, SplitterPanelBaseProps> {
}
export declare const SplitterPanel: ForwardRefExoticComponent<SplitterPanelProps & RefAttributes<HTMLDivElement>>;
