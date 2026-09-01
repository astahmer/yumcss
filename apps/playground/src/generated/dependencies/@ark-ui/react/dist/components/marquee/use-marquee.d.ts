// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as marquee from '@zag-js/marquee';
export interface UseMarqueeProps extends Optional<Omit<marquee.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseMarqueeReturn extends marquee.Api<PropTypes> {
}
export declare const useMarquee: (props?: UseMarqueeProps) => UseMarqueeReturn;
