// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as carousel from '@zag-js/carousel';
export interface UseCarouselProps extends Optional<Omit<carousel.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseCarouselReturn extends carousel.Api<PropTypes> {
}
export declare const useCarousel: (props: UseCarouselProps) => UseCarouselReturn;
