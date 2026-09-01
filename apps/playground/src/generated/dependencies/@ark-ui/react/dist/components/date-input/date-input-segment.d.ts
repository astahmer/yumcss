// Generated from the workspace-linked pandwind package. Do not edit.
import { SegmentProps } from '@zag-js/date-input';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface DateInputSegmentBaseProps extends PolymorphicProps, Pick<SegmentProps, 'segment'> {
}
export interface DateInputSegmentProps extends HTMLProps<'span'>, DateInputSegmentBaseProps {
}
export declare const DateInputSegment: ForwardRefExoticComponent<DateInputSegmentProps & RefAttributes<HTMLSpanElement>>;
