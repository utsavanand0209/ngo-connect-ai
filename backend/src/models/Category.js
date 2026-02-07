const { createModel } = require('../db/modelFactory');

module.exports = createModel({
  modelName: 'Category',
  tableName: 'categories_rel',
  docColumn: 'source_doc',
  externalIdColumn: 'external_id',
  refs: {
    createdBy: 'User'
  }
});
