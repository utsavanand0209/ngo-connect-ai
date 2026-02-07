const { createModel } = require('../db/modelFactory');

module.exports = createModel({
  modelName: 'Message',
  tableName: 'messages_rel',
  docColumn: 'source_doc',
  externalIdColumn: 'external_id',
  refs: {
    fromUser: 'User',
    fromNGO: 'NGO',
    toUser: 'User',
    toNGO: 'NGO',
    from: 'User'
  }
});
