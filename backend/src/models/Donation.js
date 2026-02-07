const { createModel } = require('../db/modelFactory');

module.exports = createModel({
  modelName: 'Donation',
  tableName: 'donations_rel',
  docColumn: 'source_doc',
  externalIdColumn: 'external_id',
  refs: {
    user: 'User',
    ngo: 'NGO',
    campaign: 'Campaign',
    certificate: 'Certificate',
    certificateApprovedBy: 'NGO'
  }
});
