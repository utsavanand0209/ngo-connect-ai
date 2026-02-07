const { createModel } = require('../db/modelFactory');

module.exports = createModel({
  modelName: 'FlagRequest',
  tableName: 'flag_requests_rel',
  docColumn: 'source_doc',
  externalIdColumn: 'external_id',
  refs: {
    requestedBy: 'User',
    resolvedBy: 'User'
  }
});
