// The mobile date pickers are optional, and an untouched picker serializes to
// "" — which Postgres rejects for a timestamptz column, 500ing the request.
// Normalize anything unusable to null so an absent date stays absent.

export function toDateOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
