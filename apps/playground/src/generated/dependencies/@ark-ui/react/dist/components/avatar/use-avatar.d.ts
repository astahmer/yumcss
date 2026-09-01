// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as avatar from '@zag-js/avatar';
export interface UseAvatarProps extends Optional<Omit<avatar.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseAvatarReturn extends avatar.Api<PropTypes> {
}
export declare const useAvatar: (props?: UseAvatarProps) => UseAvatarReturn;
