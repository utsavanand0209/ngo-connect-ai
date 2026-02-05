const mongoose = require('mongoose');
const CampaignSchema = new mongoose.Schema({
  ngo: { type: mongoose.Schema.Types.ObjectId, ref: 'NGO', required: true },
  title: { type: String, required: true },
  description: String,
  image: String,
  category: String,
  location: String,
  goalAmount: Number,
  currentAmount: { type: Number, default: 0 },
  volunteersNeeded: [String],
  volunteers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Campaign', CampaignSchema);
