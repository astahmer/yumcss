// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseTimerReturn } from './use-timer.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseTimerReturn;
}
export interface TimerRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface TimerRootProviderProps extends HTMLProps<'div'>, TimerRootProviderBaseProps {
}
export declare const TimerRootProvider: ForwardRefExoticComponent<TimerRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
