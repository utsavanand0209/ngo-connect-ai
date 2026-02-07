const { createModel } = require('../db/modelFactory');

module.exports = createModel({
  modelName: 'Campaign',
  tableName: 'campaigns_rel',
  docColumn: 'source_doc',
  externalIdColumn: 'external_id',
  refs: {
    ngo: 'NGO',
    volunteers: 'User',
    'volunteerRegistrations.user': 'User'
  }
});
