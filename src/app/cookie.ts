// Saving a small browser setting (the Split share) in a cookie for a year. Browser only: call it from an event handler.

const YEAR = 31536000;

/** Writes `name=value` for the whole site, kept for a year. */
export const writeCookie = (name: string, value: string) => {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${YEAR}; samesite=lax`;
};
