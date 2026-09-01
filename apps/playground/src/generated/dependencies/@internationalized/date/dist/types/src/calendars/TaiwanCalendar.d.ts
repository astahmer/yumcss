// Generated from the workspace-linked pandwind package. Do not edit.
import { AnyCalendarDate, CalendarIdentifier } from '../types.d.ts';
import { CalendarDate } from '../CalendarDate.d.ts';
import { GregorianCalendar } from './GregorianCalendar.d.ts';
import { Mutable } from '../utils.d.ts';
/**
 * The Taiwanese calendar is the same as the Gregorian calendar, but years
 * are numbered starting from 1912 (Gregorian). Two eras are supported:
 * 'before_minguo' and 'minguo'.
 */
export declare class TaiwanCalendar extends GregorianCalendar {
    identifier: CalendarIdentifier;
    fromJulianDay(jd: number): CalendarDate;
    toJulianDay(date: AnyCalendarDate): number;
    getEras(): string[];
    balanceDate(date: Mutable<AnyCalendarDate>): void;
    isInverseEra(date: AnyCalendarDate): boolean;
    getDaysInMonth(date: AnyCalendarDate): number;
    getYearsInEra(date: AnyCalendarDate): number;
}
