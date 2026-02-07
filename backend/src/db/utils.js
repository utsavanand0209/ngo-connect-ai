const isPlainObject = (value) =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.prototype.toString.call(value) === '[object Object]';

const deepClone = (value) => {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
};

const getByPath = (obj, path) => {
  if (!obj || !path) return undefined;
  const parts = String(path).split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
};

const setByPath = (obj, path, value) => {
  if (!obj || !path) return;
  const parts = String(path).split('.');
  let current = obj;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!isPlainObject(current[part])) current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
};

const unsetByPath = (obj, path) => {
  if (!obj || !path) return;
  const parts = String(path).split('.');
  let current = obj;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!isPlainObject(current[part])) return;
    current = current[part];
  }
  delete current[parts[parts.length - 1]];
};

const normalizeIdValue = (value) => {
  if (value && typeof value === 'object') {
    if (value.id !== undefined && value.id !== null) return String(value.id);
  }
  if (value === null || value === undefined) return value;
  return String(value);
};

const toComparable = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (!Number.isNaN(asNumber) && value.trim() !== '') return asNumber;
    const asDate = Date.parse(value);
    if (!Number.isNaN(asDate)) return asDate;
    return value.toLowerCase();
  }
  if (value instanceof Date) return value.getTime();
  return JSON.stringify(value);
};

const sortDocuments = (docs, sortSpec = {}) => {
  const sortEntries = Object.entries(sortSpec || {});
  if (sortEntries.length === 0) return docs;

  return [...docs].sort((left, right) => {
    for (const [field, directionValue] of sortEntries) {
      const direction = Number(directionValue) < 0 ? -1 : 1;
      const leftValue = toComparable(getByPath(left, field));
      const rightValue = toComparable(getByPath(right, field));

      if (leftValue === rightValue) continue;
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      return leftValue > rightValue ? direction : -direction;
    }
    return 0;
  });
};

const applySelect = (doc, selectSpec) => {
  if (!selectSpec) return deepClone(doc);

  let includeFields = [];
  let excludeFields = [];

  if (typeof selectSpec === 'string') {
    const fields = selectSpec
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    includeFields = fields.filter((entry) => !entry.startsWith('-'));
    excludeFields = fields.filter((entry) => entry.startsWith('-')).map((entry) => entry.slice(1));
  } else if (Array.isArray(selectSpec)) {
    includeFields = selectSpec.map((entry) => String(entry).trim()).filter(Boolean);
  } else if (isPlainObject(selectSpec)) {
    for (const [field, value] of Object.entries(selectSpec)) {
      if (Number(value) === 0) excludeFields.push(field);
      if (Number(value) === 1) includeFields.push(field);
    }
  }

  if (includeFields.length > 0) {
    const selected = { id: doc.id };
    for (const field of includeFields) {
      const value = getByPath(doc, field);
      if (value !== undefined) {
        setByPath(selected, field, deepClone(value));
      }
    }
    return selected;
  }

  const clone = deepClone(doc);
  for (const field of excludeFields) {
    unsetByPath(clone, field);
  }
  return clone;
};

module.exports = {
  isPlainObject,
  deepClone,
  getByPath,
  setByPath,
  unsetByPath,
  normalizeIdValue,
  sortDocuments,
  applySelect
};
