export type GolfServiceType = 'food_beverage' | 'player_service' | 'course_information' | 'event_program' | 'sponsor_activation';
export type ServiceRequestStatus = 'requested' | 'accepted' | 'in_progress' | 'ready' | 'completed' | 'cancelled' | 'rejected';

const transitions: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  requested: ['accepted', 'cancelled', 'rejected'],
  accepted: ['in_progress', 'cancelled', 'rejected'],
  in_progress: ['ready', 'completed', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  rejected: [],
};

export function canTransitionServiceRequest(from: ServiceRequestStatus, to: ServiceRequestStatus): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export function calculateServiceTotal(priceCents: number | null, quantity: number): number | null {
  if (priceCents === null) return null;
  return priceCents * quantity;
}
