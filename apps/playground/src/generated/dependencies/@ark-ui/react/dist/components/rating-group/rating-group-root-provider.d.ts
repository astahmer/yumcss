// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseRatingGroupReturn } from './use-rating-group.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
interface RootProviderProps {
    value: UseRatingGroupReturn;
}
export interface RatingGroupRootProviderBaseProps extends RootProviderProps, PolymorphicProps {
}
export interface RatingGroupRootProviderProps extends HTMLProps<'div'>, RatingGroupRootProviderBaseProps {
}
export declare const RatingGroupRootProvider: ForwardRefExoticComponent<RatingGroupRootProviderProps & RefAttributes<HTMLDivElement>>;
export {};
