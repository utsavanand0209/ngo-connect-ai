// New seed file for NGOs with detailed fields, inspired by give.do format
const mongoose = require('mongoose');
const NGO = require('./src/models/NGO');
const MONGO_URI = require('./src/config/db').mongoURI;

const ngos = [
  // ...existing NGOs with all fields...
  // Add a new, extremely rich mock NGO for demo
  {
    name: "Bright Future Foundation",
    logo: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91",
    badges: ["FCRA", "80G", "12A", "CSR-1", "ISO 9001"],
    transparency: "Platinum Certified 2025",
    mission: "Empowering communities through education, healthcare, and sustainable development.",
    primarySectors: ["Education", "Healthcare", "Women Empowerment", "Sustainability", "Technology"],
    secondarySectors: ["Vocational Training", "Microfinance", "Clean Water", "Renewable Energy", "Digital Literacy", "Disaster Relief", "Nutrition"],
    financials: {
      years: [2019, 2020, 2021, 2022, 2023, 2024],
      income: [50000000, 60000000, 75000000, 90000000, 120000000, 135000000],
      expenses: [45000000, 58000000, 70000000, 85000000, 110000000, 125000000],
      nonProgram: 8000000,
      program: 117000000
    },
    geographies: ["Bangalore", "Mysore", "Chennai", "Hyderabad", "Delhi"],
    programs: [
      { name: "Smart Schools Initiative", img: "https://images.unsplash.com/photo-1465101178521-c1a9136a3b99", desc: "Transforming rural schools with smart classrooms, e-learning, and teacher training. Over 200 schools upgraded in 3 years." },
      { name: "Women in Tech", img: "https://images.unsplash.com/photo-1515378791036-0648a3ef77b2", desc: "Scholarships, coding bootcamps, and mentorship for 1,000+ girls and women in STEM." },
      { name: "Clean Water for All", img: "https://images.unsplash.com/photo-1506744038136-46273834b3fb", desc: "Installed 150+ water purification systems in villages, impacting 50,000+ lives." },
      { name: "Green Energy Villages", img: "https://images.unsplash.com/photo-1464983953574-0892a716854b", desc: "Solar microgrids and biogas plants for 30+ off-grid communities." },
      { name: "Disaster Response Force", img: "https://images.unsplash.com/photo-1504674900247-0877df9cc836", desc: "Rapid response teams for floods, earthquakes, and pandemics. 10,000+ relief kits distributed." }
    ],
    impactMetrics: [
      "250,000+ Beneficiaries in 2025",
      "1,200+ Teachers Trained",
      "5,000+ Women Placed in Tech Jobs",
      "3,000+ Families with Clean Water",
      "100,000+ Trees Planted",
      "20,000+ Solar Lamps Distributed",
      "15,000+ Disaster Relief Kits Provided",
      "Annual Literacy Rate Increase: 12%",
      "Dropout Rate Reduced by 30%"
    ],
    leadership: [
      { name: "Dr. Asha Rao", role: "Founder & Chairperson", linkedin: "https://linkedin.com/in/asharao", photo: "https://randomuser.me/api/portraits/women/60.jpg" },
      { name: "Ravi Kumar", role: "CEO", linkedin: "https://linkedin.com/in/ravikumar", photo: "https://randomuser.me/api/portraits/men/61.jpg" },
      { name: "Meera Iyer", role: "Director of Programs", linkedin: "https://linkedin.com/in/meera-iyer", photo: "https://randomuser.me/api/portraits/women/62.jpg" },
      { name: "Sandeep Singh", role: "Head of Technology", linkedin: "https://linkedin.com/in/sandeepsingh", photo: "https://randomuser.me/api/portraits/men/63.jpg" },
      { name: "Priya Nair", role: "Finance Manager", linkedin: "https://linkedin.com/in/priyanair", photo: "https://randomuser.me/api/portraits/women/64.jpg" },
      { name: "Vikram Joshi", role: "Field Operations Lead", linkedin: "https://linkedin.com/in/vikramjoshi", photo: "https://randomuser.me/api/portraits/men/65.jpg" },
      { name: "Sunita Sharma", role: "Community Engagement", linkedin: "https://linkedin.com/in/sunitasharma", photo: "https://randomuser.me/api/portraits/women/66.jpg" },
      { name: "Ajay Patel", role: "Monitoring & Evaluation", linkedin: "https://linkedin.com/in/ajaypatel", photo: "https://randomuser.me/api/portraits/men/67.jpg" }
    ],
    orgStrength: 120,
    orgStructure: "Hierarchical with regional offices and field teams.",
    registration: {
      pan: "AAABF1234G",
      regNo: "BNG(U)-JNR-IV-999-2010-11",
      csr: "CSR00009999",
      g80: "AAABF1234GF20126",
      a12: "AAABF1234GE20045",
      fcra: "094421399"
    },
    about: "Bright Future Foundation is a multi-award-winning NGO dedicated to holistic community development. Our mission is to bridge the urban-rural divide through innovative programs in education, health, and sustainability. We partner with governments, corporates, and local leaders to maximize impact.",
    impact: "In 2025 alone, we reached over 250,000 beneficiaries, planted 100,000 trees, and provided clean water to 3,000+ families. Our disaster response teams have delivered aid to 15,000+ families in crisis.",
    vision: "A world where every community thrives with dignity, opportunity, and hope.",
    address: "#101, Sunrise Towers, MG Road, Bangalore, Karnataka, 560001",
    offices: ["Bangalore HQ", "Mysore Regional Office", "Delhi Liaison Office", "Chennai Field Office"],
    type: "Non-profit",
    subType: "Section 8 Company",
    website: "https://brightfuture.org/",
    socials: {
      youtube: "https://youtube.com/brightfuturefoundation",
      linkedin: "https://linkedin.com/company/brightfuturefoundation",
      facebook: "https://facebook.com/brightfuturefoundation",
      instagram: "https://instagram.com/brightfuturefoundation",
      twitter: "https://twitter.com/brightfutureorg"
    },
    tech: {
      soc2: true,
      financial: true,
      beneficiary: true
    }
  }
];

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    await NGO.deleteMany({});
    await NGO.insertMany(ngos);
    console.log('NGO seed data inserted successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding NGOs:', err);
    process.exit(1);
  }
}

seed();
    const campaigns = [];
    for (let i = 1; i <= 100; i++) {
      const isFundraising = i <= 50;
      campaigns.push({
        ngo: createdNGOs[i % createdNGOs.length]._id,
        title: isFundraising ? `Fundraising Campaign ${i}` : `Volunteering Campaign ${i-50}`,
        description: isFundraising
          ? `Help us raise funds for cause ${i}`
          : `Join us to volunteer for cause ${i-50}`,
        category: categories[i % categories.length],
        location: cities[i % cities.length],
        goalAmount: isFundraising ? 100000 + i * 1000 : 0,
        currentAmount: isFundraising ? Math.floor((100000 + i * 1000) * Math.random()) : 0,
        volunteersNeeded: isFundraising ? [] : ['General', 'Specialist'],
        volunteers: isFundraising ? [] : [createdUsers[i % createdUsers.length]._id]
      });
    }

    const createdCampaigns = await Campaign.insertMany(campaigns);
    console.log(`✅ Created ${createdCampaigns.length} sample campaigns`);

    // Create admin user
    const adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@ngoconnect.org',
      password: hashedPassword,
      role: 'admin'
    });
    console.log(`✅ Created admin user: admin@ngoconnect.org`);

    console.log('\n🎉 Database seeded successfully!\n');
    console.log('📝 Test Credentials:');
    console.log('─────────────────────────────────────────');
    console.log('Admin: admin@ngoconnect.org / password123');
    console.log('User: rahul@example.com / password123');
    console.log('NGO: eduforall@ngo.org / password123');
    console.log('─────────────────────────────────────────\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding database:', err);
    process.exit(1);
  }
};

seedDatabase();
