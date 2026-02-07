const { createModel } = require('../db/modelFactory');

module.exports = createModel({
  modelName: 'User',
  tableName: 'users_rel',
  docColumn: 'source_doc',
  externalIdColumn: 'external_id'
});
