// Generated from the workspace-linked pandwind package. Do not edit.
import { ReactNode } from 'react';
import { UseStepsContext } from './use-steps-context.d.ts';
export interface StepsContextProps {
    children: (context: UseStepsContext) => ReactNode;
}
export declare const StepsContext: {
    (props: StepsContextProps): ReactNode;
    displayName: string;
};
