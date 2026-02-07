const { createModel } = require('../db/modelFactory');

module.exports = createModel({
  modelName: 'VolunteerOpportunity',
  tableName: 'volunteer_opportunities_rel',
  docColumn: 'source_doc',
  externalIdColumn: 'external_id',
  refs: {
    ngo: 'NGO',
    applicants: 'User'
  }
});
