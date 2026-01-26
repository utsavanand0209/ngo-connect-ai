const mongoose = require('mongoose');

const NGOSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String },
  password: { type: String },
  category: String,
  description: String,
  about: String,
  achievements: [String],
  contactLink: String,
  location: String,
  verified: { type: Boolean, default: false },
  verificationDocs: [String],
  createdAt: { type: Date, default: Date.now },

  // New detailed fields
  logo: String,
  badges: [String],
  transparency: String,
  mission: String,
  primarySectors: [String],
  secondarySectors: [String],
  financials: {
    years: [Number],
    income: [Number],
    expenses: [Number],
    nonProgram: Number,
    program: Number
  },
  geographies: [String],
  programs: [
    {
      name: String,
      img: String,
      desc: String
    }
  ],
  impactMetrics: [String],
  leadership: [
    {
      name: String,
      role: String,
      linkedin: String
    }
  ],
  orgStrength: Number,
  orgStructure: String,
  registration: {
    pan: String,
    regNo: String,
    csr: String,
    g80: String,
    a12: String,
    fcra: String
  },
  impact: String,
  vision: String,
  address: String,
  offices: [String],
  type: String,
  subType: String,
  website: String,
  socials: {
    youtube: String,
    linkedin: String,
    facebook: String,
    instagram: String,
    twitter: String
  },
  tech: {
    soc2: Boolean,
    financial: Boolean,
    beneficiary: Boolean
  }
});

module.exports = mongoose.model('NGO', NGOSchema);
