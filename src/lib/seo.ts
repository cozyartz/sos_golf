import type { Course } from './golf';

export type CourseSeoRecord = Pick<Course, 'id' | 'name' | 'region' | 'address'> & {
  stateCode?: string;
  approved?: boolean;
  description?: string;
  image?: string;
  latitude?: number;
  longitude?: number;
  url?: string;
};

export function courseTitle(course: CourseSeoRecord) {
  return `${course.name} | Course Guide, Events & Connected Golf`;
}

export function courseDescription(course: CourseSeoRecord) {
  return course.description ?? `Explore the approved ${course.name} course profile, local guidance, events, leagues, and connected golfer experiences in ${course.region}.`;
}

/**
 * Schema is intentionally conservative. A demo record is a WebPage about a
 * proposed course profile; only an operator-approved record becomes a
 * discoverable SportsActivityLocation.
 */
export function courseStructuredData(course: CourseSeoRecord, siteUrl = 'https://golf.stateofstick.co') {
  const url = course.url ?? `${siteUrl}/course/${course.id}/`;
  const location = course.approved
    ? {
        '@type': 'SportsActivityLocation',
        name: course.name,
        address: { '@type': 'PostalAddress', addressLocality: course.address, addressRegion: course.stateCode ?? course.region },
        ...(course.latitude !== undefined && course.longitude !== undefined ? { geo: { '@type': 'GeoCoordinates', latitude: course.latitude, longitude: course.longitude } } : {})
      }
    : {
        '@type': 'Place',
        name: course.name,
        description: 'Proposed course profile using demonstration data; not an approved course partner.'
      };

  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: courseTitle(course),
    description: courseDescription(course),
    url,
    about: location,
    isPartOf: { '@type': 'WebSite', name: 'StickLink Golf', url: `${siteUrl}/` }
  };
}
