// Generated from the workspace-linked pandwind package. Do not edit.
import { Service } from '@zag-js/core';
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { TooltipSchema, TooltipApi } from './tooltip.types.d.ts';
import '@zag-js/popper';

declare function connect<P extends PropTypes>(service: Service<TooltipSchema>, normalize: NormalizeProps<P>): TooltipApi<P>;

export { connect };
