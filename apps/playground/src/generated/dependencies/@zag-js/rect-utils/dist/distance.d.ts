// Generated from the workspace-linked pandwind package. Do not edit.
import { Point, Rect, RectSide } from './types.d.ts';

interface DistanceValue extends Point {
    value: number;
}
declare function distance(a: Point, b?: Point): number;
declare function distanceFromPoint(r: Rect, p: Point): DistanceValue;
declare function distanceFromRect(a: Rect, b: Rect): DistanceValue;
declare function distanceBtwEdges(a: Rect, b: Rect): Record<RectSide, number>;

export { type DistanceValue, distance, distanceBtwEdges, distanceFromPoint, distanceFromRect };
