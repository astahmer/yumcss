// Generated from the workspace-linked pandwind package. Do not edit.
import { Service } from '@zag-js/core';
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { PresenceSchema, PresenceApi } from './presence.types.d.ts';

declare function connect<T extends PropTypes>(service: Service<PresenceSchema>, _normalize: NormalizeProps<T>): PresenceApi;

export { connect };
