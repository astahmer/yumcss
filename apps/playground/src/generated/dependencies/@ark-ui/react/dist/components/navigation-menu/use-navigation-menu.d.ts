// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes } from '@zag-js/react';
import { Optional } from '../../types.d.ts';
import * as navigationMenu from '@zag-js/navigation-menu';
export interface UseNavigationMenuProps extends Optional<Omit<navigationMenu.Props, 'dir' | 'getRootNode'>, 'id'> {
}
export interface UseNavigationMenuReturn extends navigationMenu.Api<PropTypes> {
}
export declare const useNavigationMenu: (props?: UseNavigationMenuProps) => UseNavigationMenuReturn;
