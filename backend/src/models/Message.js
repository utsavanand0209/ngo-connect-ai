const { createModel } = require('../db/modelFactory');

module.exports = createModel({
  modelName: 'Message',
  tableName: 'messages_rel',
  docColumn: 'source_doc',
  externalIdColumn: 'external_id',
  refs: {
    from: 'User',
    toNGO: 'NGO'
  }
});
