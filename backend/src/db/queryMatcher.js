const { getByPath, isPlainObject, normalizeIdValue, deepClone } = require('./utils');

const toRegex = (pattern) => {
  if (!(pattern instanceof RegExp)) return null;
  const flags = pattern.flags.replace('g', '');
  return new RegExp(pattern.source, flags);
};

const valueEquals = (left, right) => {
  if (left === right) return true;
  if (left === null || left === undefined || right === null || right === undefined) return false;

  if (isPlainObject(left) && isPlainObject(right)) {
    if (left.id || right.id) {
      return String(left.id || '') === String(right.id || '');
    }
    return JSON.stringify(deepClone(left)) === JSON.stringify(deepClone(right));
  }

  const normalizedLeft = normalizeIdValue(left);
  const normalizedRight = normalizeIdValue(right);

  return String(normalizedLeft) === String(normalizedRight);
};

const regexMatches = (pattern, value) => {
  const matcher = toRegex(pattern);
  if (!matcher) return false;

  if (Array.isArray(value)) {
    return value.some((entry) => matcher.test(String(entry)));
  }
  if (value === null || value === undefined) return false;
  return matcher.test(String(value));
};

const matchesOperatorCondition = (value, condition) => {
  if (!isPlainObject(condition)) return valueEquals(value, condition);

  const operators = Object.keys(condition).filter((key) => key.startsWith('$'));
  if (operators.length === 0) return valueEquals(value, condition);

  for (const operator of operators) {
    const operand = condition[operator];

    if (operator === '$in') {
      if (!Array.isArray(operand)) return false;
      const matched = Array.isArray(value)
        ? value.some((entry) => operand.some((candidate) => valueEquals(entry, candidate)))
        : operand.some((candidate) => valueEquals(value, candidate));
      if (!matched) return false;
      continue;
    }

    if (operator === '$ne') {
      if (valueEquals(value, operand)) return false;
      continue;
    }

    if (operator === '$gt') {
      if (!(Number(value) > Number(operand))) return false;
      continue;
    }

    if (operator === '$gte') {
      if (!(Number(value) >= Number(operand))) return false;
      continue;
    }

    if (operator === '$lt') {
      if (!(Number(value) < Number(operand))) return false;
      continue;
    }

    if (operator === '$lte') {
      if (!(Number(value) <= Number(operand))) return false;
      continue;
    }

    if (operator === '$exists') {
      const exists = value !== undefined;
      if (Boolean(operand) !== exists) return false;
      continue;
    }

    return false;
  }

  return true;
};

const matchesCondition = (value, condition) => {
  if (condition instanceof RegExp) return regexMatches(condition, value);

  if (isPlainObject(condition)) {
    if (Object.keys(condition).some((key) => key.startsWith('$'))) {
      return matchesOperatorCondition(value, condition);
    }
  }

  if (Array.isArray(value)) {
    if (Array.isArray(condition)) {
      if (value.length !== condition.length) return false;
      return value.every((entry, index) => valueEquals(entry, condition[index]));
    }
    return value.some((entry) => valueEquals(entry, condition));
  }

  return valueEquals(value, condition);
};

const matchesFilter = (doc, filter = {}) => {
  if (!filter || Object.keys(filter).length === 0) return true;

  if (filter.$and && (!Array.isArray(filter.$and) || !filter.$and.every((entry) => matchesFilter(doc, entry)))) {
    return false;
  }

  if (filter.$or && (!Array.isArray(filter.$or) || !filter.$or.some((entry) => matchesFilter(doc, entry)))) {
    return false;
  }

  for (const [key, value] of Object.entries(filter)) {
    if (key === '$and' || key === '$or') continue;

    const docValue = key === 'id' ? doc.id : getByPath(doc, key);
    if (!matchesCondition(docValue, value)) return false;
  }

  return true;
};

module.exports = {
  matchesFilter
};
