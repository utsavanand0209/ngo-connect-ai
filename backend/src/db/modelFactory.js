const { query, quoteIdentifier } = require('./postgres');
const { generateId } = require('./id');
const { matchesFilter } = require('./queryMatcher');
const {
  isPlainObject,
  deepClone,
  getByPath,
  setByPath,
  normalizeIdValue,
  sortDocuments,
  applySelect
} = require('./utils');

const modelRegistry = new Map();

const normalizePopulate = (pathOrSpec, select) => {
  if (!pathOrSpec) return [];

  if (Array.isArray(pathOrSpec)) {
    return pathOrSpec.flatMap((entry) => normalizePopulate(entry));
  }

  if (typeof pathOrSpec === 'string') {
    return [{ path: pathOrSpec, select }];
  }

  if (isPlainObject(pathOrSpec) && pathOrSpec.path) {
    return [
      {
        path: pathOrSpec.path,
        select: pathOrSpec.select,
        populate: pathOrSpec.populate
      }
    ];
  }

  return [];
};

const mapDatabaseError = (error) => {
  if (error && error.code === '23505') {
    const duplicateError = new Error(error.detail || error.message || 'Duplicate key error');
    duplicateError.code = 11000;
    duplicateError.original = error;
    return duplicateError;
  }
  return error;
};

const normalizeDocumentId = (doc) => {
  if (!doc || !isPlainObject(doc)) return doc;
  const normalized = doc;
  const idValue = normalized.id;
  if (idValue !== undefined && idValue !== null) {
    normalized.id = String(idValue);
  }
  return normalized;
};

const ensureTimestamps = (payload = {}, keepCreatedAt = false) => {
  const now = new Date().toISOString();
  if (!keepCreatedAt || !payload.createdAt) payload.createdAt = payload.createdAt || now;
  payload.updatedAt = now;
  return payload;
};

const applyUpdatePayload = (sourceDoc, update = {}) => {
  const target = deepClone(sourceDoc || {});
  if (!isPlainObject(update)) return target;

  if (isPlainObject(update.$set)) {
    for (const [key, value] of Object.entries(update.$set)) {
      setByPath(target, key, deepClone(value));
    }
  }

  if (isPlainObject(update.$inc)) {
    for (const [key, value] of Object.entries(update.$inc)) {
      const current = Number(getByPath(target, key) || 0);
      const increment = Number(value || 0);
      setByPath(target, key, current + increment);
    }
  }

  if (isPlainObject(update.$push)) {
    for (const [key, value] of Object.entries(update.$push)) {
      const current = getByPath(target, key);
      const list = Array.isArray(current) ? [...current] : [];
      if (isPlainObject(value) && Array.isArray(value.$each)) {
        list.push(...value.$each);
      } else {
        list.push(value);
      }
      setByPath(target, key, list);
    }
  }

  for (const [key, value] of Object.entries(update)) {
    if (key.startsWith('$')) continue;
    setByPath(target, key, deepClone(value));
  }

  return target;
};

const attachDocumentMethods = (Model, doc) => {
  if (!doc || !isPlainObject(doc)) return doc;

  Object.defineProperty(doc, 'save', {
    enumerable: false,
    configurable: true,
    writable: true,
    value: async function save() {
      const plain = deepClone(this);
      const saved = await Model._upsertRaw(plain, { preserveCreatedAt: true });
      Object.keys(this).forEach((key) => {
        delete this[key];
      });
      Object.assign(this, saved);
      return this;
    }
  });

  Object.defineProperty(doc, 'toObject', {
    enumerable: false,
    configurable: true,
    writable: true,
    value: function toObject() {
      return deepClone(this);
    }
  });

  Object.defineProperty(doc, 'populate', {
    enumerable: false,
    configurable: true,
    writable: true,
    value: async function populate(pathOrSpec, select) {
      const populateSpecs = normalizePopulate(pathOrSpec, select);
      if (populateSpecs.length === 0) return this;
      const [populated] = await Model._populateDocs([deepClone(this)], populateSpecs);
      if (populated) {
        Object.keys(this).forEach((key) => {
          delete this[key];
        });
        Object.assign(this, populated);
      }
      return this;
    }
  });

  return doc;
};

const wrapDocument = (Model, raw) => {
  if (!raw) return null;
  const payload = normalizeDocumentId(deepClone(raw));
  return attachDocumentMethods(Model, payload);
};

class QueryChain {
  constructor(model, mode, args = {}) {
    this.model = model;
    this.mode = mode;
    this.args = args;
    this.sortSpec = null;
    this.limitValue = null;
    this.selectSpec = args.select || null;
    this.populateSpecs = [];
  }

  populate(pathOrSpec, select) {
    this.populateSpecs.push(...normalizePopulate(pathOrSpec, select));
    return this;
  }

  sort(spec) {
    this.sortSpec = spec;
    return this;
  }

  limit(value) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) this.limitValue = parsed;
    return this;
  }

  select(spec) {
    this.selectSpec = spec;
    return this;
  }

  async _loadBaseDocuments() {
    if (this.mode === 'byId') {
      const doc = await this.model._findByIdRaw(this.args.id);
      return doc ? [doc] : [];
    }

    const docs = await this.model._loadAllRawDocs();
    const filtered = docs.filter((doc) => matchesFilter(doc, this.args.filter || {}));

    if (this.mode === 'one') {
      return filtered.slice(0, 1);
    }

    return filtered;
  }

  async exec() {
    let docs = await this._loadBaseDocuments();

    if (this.sortSpec && this.mode === 'many') {
      docs = sortDocuments(docs, this.sortSpec);
    }

    if (this.limitValue !== null && this.mode === 'many') {
      docs = docs.slice(0, this.limitValue);
    }

    if (this.populateSpecs.length > 0) {
      docs = await this.model._populateDocs(docs, this.populateSpecs);
    }

    if (this.selectSpec) {
      docs = docs.map((doc) => applySelect(doc, this.selectSpec));
    }

    const wrapped = docs.map((doc) => wrapDocument(this.model, doc));
    if (this.mode === 'many') return wrapped;
    return wrapped[0] || null;
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }

  finally(callback) {
    return this.exec().finally(callback);
  }
}

class BaseModel {
  static get table() {
    return quoteIdentifier(this.tableName);
  }

  static get docColumn() {
    return quoteIdentifier(this._docColumn || 'doc');
  }

  static get externalIdColumn() {
    return quoteIdentifier(this._externalIdColumn || 'id');
  }

  static async _loadAllRawDocs() {
    const { rows } = await query(`SELECT ${this.docColumn} AS doc FROM ${this.table}`);
    return rows
      .map((row) => row.doc)
      .filter(Boolean)
      .map((doc) => {
        return normalizeDocumentId(doc);
      });
  }

  static async _findByIdRaw(id) {
    if (!id) return null;
    const { rows } = await query(
      `SELECT ${this.docColumn} AS doc FROM ${this.table} WHERE ${this.externalIdColumn} = $1 LIMIT 1`,
      [String(id)]
    );
    if (!rows.length) return null;
    const doc = normalizeDocumentId(rows[0].doc);
    if (doc && !doc.id) {
      doc.id = String(id);
    }
    return doc || null;
  }

  static async _upsertRaw(payload = {}, options = {}) {
    const document = deepClone(payload || {});
    const idValue = document.id;
    const normalizedId = idValue ? String(idValue) : generateId();
    document.id = normalizedId;
    ensureTimestamps(document, options.preserveCreatedAt);

    const createdAt = Number.isNaN(Date.parse(document.createdAt))
      ? new Date().toISOString()
      : new Date(document.createdAt).toISOString();

    try {
      await query(
        `
        INSERT INTO ${this.table} (${this.externalIdColumn}, ${this.docColumn}, created_at, updated_at)
        VALUES ($1, $2::jsonb, $3::timestamptz, NOW())
        ON CONFLICT (${this.externalIdColumn})
        DO UPDATE SET ${this.docColumn} = EXCLUDED.${this.docColumn}, updated_at = NOW()
      `,
        [document.id, JSON.stringify(document), createdAt]
      );
      return document;
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  static async create(payload = {}) {
    const saved = await this._upsertRaw(payload);
    return wrapDocument(this, saved);
  }

  static async insertMany(items = []) {
    const created = [];
    for (const item of items || []) {
      created.push(await this.create(item));
    }
    return created;
  }

  static find(filter = {}, select) {
    return new QueryChain(this, 'many', { filter: filter || {}, select });
  }

  static findOne(filter = {}, select) {
    return new QueryChain(this, 'one', { filter: filter || {}, select });
  }

  static findById(id) {
    return new QueryChain(this, 'byId', { id: String(id || '') });
  }

  static async findByIdAndUpdate(id, update = {}, options = {}) {
    const existing = await this._findByIdRaw(id);
    if (!existing) return null;

    const updated = applyUpdatePayload(existing, update);
    updated.id = String(id);

    const saved = await this._upsertRaw(updated, { preserveCreatedAt: true });
    return wrapDocument(this, options.new ? saved : existing);
  }

  static async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    const docs = await this._loadAllRawDocs();
    const existing = docs.find((doc) => matchesFilter(doc, filter));
    if (!existing) return null;

    const updated = applyUpdatePayload(existing, update);
    const existingId = String(existing.id);
    updated.id = existingId;

    const saved = await this._upsertRaw(updated, { preserveCreatedAt: true });
    return wrapDocument(this, options.new ? saved : existing);
  }

  static async findByIdAndDelete(id) {
    const existing = await this._findByIdRaw(id);
    if (!existing) return null;
    await query(`DELETE FROM ${this.table} WHERE ${this.externalIdColumn} = $1`, [String(id)]);
    return wrapDocument(this, existing);
  }

  static async deleteMany(filter = {}) {
    const hasFilter = filter && Object.keys(filter).length > 0;
    if (!hasFilter) {
      const result = await query(`DELETE FROM ${this.table}`);
      return { deletedCount: result.rowCount || 0 };
    }

    const docs = await this._loadAllRawDocs();
    const targetIds = docs
      .filter((doc) => matchesFilter(doc, filter))
      .map((doc) => String(doc.id))
      .filter(Boolean);

    if (!targetIds.length) return { deletedCount: 0 };

    await query(`DELETE FROM ${this.table} WHERE ${this.externalIdColumn} = ANY($1::text[])`, [targetIds]);
    return { deletedCount: targetIds.length };
  }

  static async countDocuments(filter = {}) {
    const docs = await this._loadAllRawDocs();
    return docs.filter((doc) => matchesFilter(doc, filter)).length;
  }

  static _resolvePopulateModel(path) {
    if (!this.refs) return null;
    const modelName = this.refs[path];
    return modelRegistry.get(modelName) || null;
  }

  static async _populateDocs(documents = [], populateSpecs = []) {
    const specs = normalizePopulate(populateSpecs);
    if (specs.length === 0) return documents;

    const docs = deepClone(documents || []);

    for (const doc of docs) {
      for (const spec of specs) {
        if (!spec.path) continue;
        const RelatedModel = this._resolvePopulateModel(spec.path);
        if (!RelatedModel) continue;

        const originalValue = getByPath(doc, spec.path);
        if (originalValue === null || originalValue === undefined) continue;

        if (Array.isArray(originalValue)) {
          const populatedArray = [];
          for (const item of originalValue) {
            const refId = normalizeIdValue(item);
            if (!refId) continue;
            let relatedDoc = await RelatedModel._findByIdRaw(refId);
            if (!relatedDoc) continue;
            if (spec.populate) {
              [relatedDoc] = await RelatedModel._populateDocs([relatedDoc], spec.populate);
            }
            if (spec.select) {
              relatedDoc = applySelect(relatedDoc, spec.select);
            }
            populatedArray.push(relatedDoc);
          }
          setByPath(doc, spec.path, populatedArray);
          continue;
        }

        const refId = normalizeIdValue(originalValue);
        if (!refId) {
          setByPath(doc, spec.path, null);
          continue;
        }

        let relatedDoc = await RelatedModel._findByIdRaw(refId);
        if (!relatedDoc) {
          setByPath(doc, spec.path, null);
          continue;
        }
        if (spec.populate) {
          [relatedDoc] = await RelatedModel._populateDocs([relatedDoc], spec.populate);
        }
        if (spec.select) {
          relatedDoc = applySelect(relatedDoc, spec.select);
        }
        setByPath(doc, spec.path, relatedDoc);
      }
    }

    return docs;
  }
}

const createModel = ({
  modelName,
  tableName,
  refs = {},
  docColumn = 'doc',
  externalIdColumn = 'id'
}) => {
  class Model extends BaseModel {}
  Model.modelName = modelName;
  Model.tableName = tableName;
  Model.refs = refs;
  Model._docColumn = docColumn;
  Model._externalIdColumn = externalIdColumn;
  modelRegistry.set(modelName, Model);
  return Model;
};

const getModel = (modelName) => modelRegistry.get(modelName);

module.exports = {
  createModel,
  getModel
};
