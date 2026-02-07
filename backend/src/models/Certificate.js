const { createModel } = require('../db/modelFactory');

module.exports = createModel({
  modelName: 'Certificate',
  tableName: 'certificates_rel',
  docColumn: 'source_doc',
  externalIdColumn: 'external_id',
  refs: {
    user: 'User',
    ngo: 'NGO',
    campaign: 'Campaign',
    donation: 'Donation',
    volunteerApplication: 'VolunteerApplication'
  }
});
