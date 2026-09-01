// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { ScrollAreaService, ScrollAreaApi } from './scroll-area.types.d.ts';
import '@zag-js/core';
import './utils/timeout.d.ts';

declare function connect<T extends PropTypes>(service: ScrollAreaService, normalize: NormalizeProps<T>): ScrollAreaApi<T>;

export { connect };
