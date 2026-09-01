// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseTimerProps } from './use-timer.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface TimerRootBaseProps extends UseTimerProps, PolymorphicProps {
}
export interface TimerRootProps extends HTMLProps<'div'>, TimerRootBaseProps {
}
export declare const TimerRoot: ForwardRefExoticComponent<TimerRootProps & RefAttributes<HTMLDivElement>>;
