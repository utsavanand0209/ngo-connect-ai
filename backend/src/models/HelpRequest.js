const { createModel } = require('../db/modelFactory');

module.exports = createModel({
  modelName: 'HelpRequest',
  tableName: 'help_requests_rel',
  docColumn: 'source_doc',
  externalIdColumn: 'external_id',
  refs: {
    user: 'User',
    ngo: 'NGO'
  }
});
