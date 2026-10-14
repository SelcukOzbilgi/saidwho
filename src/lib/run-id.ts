// A saved run's id: 8 random bytes in base64url, so 11 characters. The database,
// the run page and the browser all check this same pattern, and the id goes into
// a database filter, so nothing else may pass for one.
export const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export const isRunId = (value: string): boolean => RUN_ID_PATTERN.test(value);
