// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseStepsReturn } from './use-steps.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseStepsReturn;
}
export interface StepsRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface StepsRootProviderProps extends HTMLProps<'div'>, StepsRootProviderBaseProps {
}
export declare const StepsRootProvider: ForwardRefExoticComponent<StepsRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
