// Generated from the workspace-linked pandwind package. Do not edit.
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UseRatingGroupProps } from './use-rating-group.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface RatingGroupRootBaseProps extends UseRatingGroupProps, PolymorphicProps {
}
export interface RatingGroupRootProps extends Assign<HTMLProps<'div'>, RatingGroupRootBaseProps> {
}
export declare const RatingGroupRoot: ForwardRefExoticComponent<RatingGroupRootProps & RefAttributes<HTMLDivElement>>;
