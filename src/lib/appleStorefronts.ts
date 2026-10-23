import type { AppleStorefront } from './types';

/** Storefronts used for Apple catalog searches and live chart availability checks. */
export const APPLE_STOREFRONTS: readonly { id: AppleStorefront; label: string }[] = [
  { id: 'id', label: 'Indonesia' },
  { id: 'us', label: 'United States' },
  { id: 'gb', label: 'United Kingdom' },
  { id: 'au', label: 'Australia' },
  { id: 'ca', label: 'Canada' },
  { id: 'jp', label: 'Japan' },
  { id: 'de', label: 'Germany' },
  { id: 'fr', label: 'France' },
];
