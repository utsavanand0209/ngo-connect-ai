const { createModel } = require('../db/modelFactory');

module.exports = createModel({
  modelName: 'VolunteerApplication',
  tableName: 'volunteer_applications_rel',
  docColumn: 'source_doc',
  externalIdColumn: 'external_id',
  refs: {
    user: 'User',
    ngo: 'NGO',
    opportunity: 'VolunteerOpportunity',
    certificate: 'Certificate',
    certificateApprovedBy: 'NGO'
  }
});
