function validateFieldValue(value, fieldType, fieldLabel) {
  if (fieldType === 'number') {
    const num = Number(value);
    if (isNaN(num) || value.trim() === '') {
      return { valid: false, error: `**${fieldLabel}** must be a valid number.` };
    }
    if (num < 0) {
      return { valid: false, error: `**${fieldLabel}** must be a positive number.` };
    }
  }

  if (value.length > 1024) {
    return { valid: false, error: `**${fieldLabel}** is too long (max 1024 characters).` };
  }

  return { valid: true };
}

function sanitizeValue(value, fieldType) {
  const trimmed = value.trim();
  if (fieldType === 'number') {
    return String(Number(trimmed));
  }
  return trimmed;
}

module.exports = { validateFieldValue, sanitizeValue };
