// Generated from the workspace-linked pandwind package. Do not edit.
import { ResizeTriggerProps } from '@zag-js/splitter';
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface SplitterResizeTriggerBaseProps extends ResizeTriggerProps, PolymorphicProps {
}
export interface SplitterResizeTriggerProps extends Assign<HTMLProps<'button'>, SplitterResizeTriggerBaseProps> {
}
export declare const SplitterResizeTrigger: ForwardRefExoticComponent<SplitterResizeTriggerProps & RefAttributes<HTMLButtonElement>>;
