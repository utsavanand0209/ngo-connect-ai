const { createModel } = require('../db/modelFactory');

module.exports = createModel({
  modelName: 'NGO',
  tableName: 'ngos_rel',
  docColumn: 'source_doc',
  externalIdColumn: 'external_id'
});
