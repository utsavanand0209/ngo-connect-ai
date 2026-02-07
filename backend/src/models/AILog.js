const { createModel } = require('../db/modelFactory');

module.exports = createModel({
  modelName: 'AILog',
  tableName: 'ai_logs_rel',
  docColumn: 'source_doc',
  externalIdColumn: 'external_id'
});
