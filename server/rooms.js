// Validation of room input. Pure: no database, no HTTP.

export const NAME_MAX = 60;

const SIZES = [
  { field: 'length', label: 'Length', min: 0.5, max: 100 },
  { field: 'width', label: 'Width', min: 0.5, max: 100 },
  { field: 'height', label: 'Height', min: 0.5, max: 10 },
];

// Returns { room: { name, length, width, height } } when the input is valid,
// otherwise { error, field } for the first failing field (field is missing
// when the body itself is wrong).
export function validateRoom(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' };
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name === '') return { error: 'Name is required', field: 'name' };
  if (name.length > NAME_MAX) {
    return { error: `Name must be ${NAME_MAX} characters or fewer`, field: 'name' };
  }
  const room = { name };
  for (const { field, label, min, max } of SIZES) {
    const value = body[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      return { error: `${label} must be a number from ${min} to ${max} m`, field };
    }
    room[field] = value;
  }
  return { room };
}
