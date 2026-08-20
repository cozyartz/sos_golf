export type TeeTimeStatus = 'reserved' | 'activated' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';

export const teeTimeStatuses: readonly TeeTimeStatus[] = ['reserved', 'activated', 'checked_in', 'completed', 'cancelled', 'no_show'];

export function isTeeTimeStatus(value: unknown): value is TeeTimeStatus {
  return typeof value === 'string' && teeTimeStatuses.includes(value as TeeTimeStatus);
}

export function isTeeTimePlayerCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 8;
}

export function isTeeTimeSource(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9 ._-]{1,79}$/.test(value.trim());
}

export function canTransitionTeeTimeStatus(from: TeeTimeStatus, to: TeeTimeStatus): boolean {
  const transitions: Record<TeeTimeStatus, readonly TeeTimeStatus[]> = {
    reserved: ['activated', 'cancelled', 'no_show'],
    activated: ['checked_in', 'cancelled', 'no_show'],
    checked_in: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
    no_show: [],
  };
  return from === to || transitions[from].includes(to);
}
