// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { TourService, TourApi } from './tour.types.d.ts';
import '@zag-js/core';
import '@zag-js/dismissable';
import '@zag-js/popper';
import './utils/rect.d.ts';

declare function connect<T extends PropTypes>(service: TourService, normalize: NormalizeProps<T>): TourApi<T>;

export { connect };
