const { createModel } = require('../db/modelFactory');

module.exports = createModel({
  modelName: 'Notification',
  tableName: 'notifications_rel',
  docColumn: 'source_doc',
  externalIdColumn: 'external_id',
  refs: {
    createdBy: 'User'
  }
});
