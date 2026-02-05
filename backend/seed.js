const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');
const NGO = require('./src/models/NGO');
const Campaign = require('./src/models/Campaign');
const connectDB = require('./src/config/db');
const { faker } = require('@faker-js/faker/locale/en');

const seedDatabase = async () => {
  try {
    await connectDB(process.env.MONGO_URI || 'mongodb://localhost:27017/ngo-connect');

    // Clear existing data
    await User.deleteMany({});
    await NGO.deleteMany({});
    await Campaign.deleteMany({});

    console.log('🧹 Cleared existing data');

    // --- CREATE USERS ---
    const users = [];
    const hashedPassword = await bcrypt.hash('password123', 10);

    for (let i = 0; i < 50; i++) {
      users.push({
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: hashedPassword,
        role: 'user',
        interests: faker.helpers.arrayElements(['Education', 'Health', 'Environment', 'Animals', 'Human Rights', 'Arts & Culture'], 2),
        skills: faker.helpers.arrayElements(['Marketing', 'Writing', 'Design', 'Development', 'Management', 'Fundraising'], 2)
      });
    }
    users.push({
      name: 'Rahul Kumar',
      email: 'rahul@example.com',
      password: hashedPassword,
      role: 'user'
    })

    const createdUsers = await User.insertMany(users);
    console.log(`✅ Created ${createdUsers.length} sample users`);

    // --- CREATE NGOs ---
    const ngos = [];
    const categories = ['Education', 'Health', 'Food', 'Environment', 'Animals', 'Human Rights', 'Arts & Culture'];
    const cities = ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad', 'Pune'];

    for (let i = 0; i < 15; i++) {
        const financials = {
            years: [2020, 2021, 2022, 2023, 2024],
            income: [],
            expenses: []
        };
        for (let j = 0; j < 5; j++) {
            const income = faker.finance.amount({ min: 100000, max: 2000000, dec: 0 });
            const expenses = income * faker.number.float({ min: 0.7, max: 0.95, precision: 0.01 });
            financials.income.push(income);
            financials.expenses.push(expenses);
        }
        financials.nonProgram = financials.expenses[4] * faker.number.float({ min: 0.1, max: 0.2, precision: 0.01 });
        financials.program = financials.expenses[4] - financials.nonProgram;

        ngos.push({
            name: faker.company.name() + ' Foundation',
            email: faker.internet.email(),
            password: hashedPassword,
            role: 'ngo',
            verified: faker.datatype.boolean(0.8), // 80% chance of being verified
            logo: faker.image.url(),
            badges: faker.helpers.arrayElements(["FCRA", "80G", "12A", "CSR-1"], faker.number.int({ min: 1, max: 4 })),
            transparency: faker.helpers.arrayElement(['Gold Certified', 'Silver Certified', 'Platinum Certified', 'Not Certified']),
            mission: faker.company.catchPhrase(),
            about: faker.commerce.productDescription(),
            vision: faker.company.buzzPhrase(),
            primarySectors: faker.helpers.arrayElements(categories, faker.number.int({ min: 1, max: 3 })),
            secondarySectors: faker.helpers.arrayElements(categories, faker.number.int({ min: 1, max: 2 })),
            financials: financials,
            geographies: faker.helpers.arrayElements(cities, faker.number.int({ min: 1, max: 3 })),
            programs: Array.from({ length: faker.number.int({ min: 2, max: 5 }) }, () => ({
                name: faker.commerce.productName(),
                img: faker.image.url(),
                desc: faker.commerce.productDescription()
            })),
            impactMetrics: Array.from({ length: faker.number.int({ min: 3, max: 6 }) }, () => faker.company.catchPhrase()),
            leadership: Array.from({ length: faker.number.int({ min: 2, max: 5 }) }, () => ({
                name: faker.person.fullName(),
                role: faker.person.jobTitle(),
                linkedin: `https://linkedin.com/in/${faker.person.firstName().toLowerCase()}`,
                photo: faker.image.avatar()
            })),
            orgStrength: faker.number.int({ min: 10, max: 500 }),
            orgStructure: faker.company.buzzPhrase(),
            registration: {
                pan: faker.string.alphanumeric(10).toUpperCase(),
                regNo: faker.string.alphanumeric(15).toUpperCase(),
            },
            address: faker.location.streetAddress(),
            website: faker.internet.url(),
        });
    }

    const createdNGOs = await NGO.insertMany(ngos);
    console.log(`✅ Created ${createdNGOs.length} sample NGOs`);

    // --- CREATE CAMPAIGNS ---
    const campaigns = [];
    for (let i = 0; i < 40; i++) {
        const isFundraising = faker.datatype.boolean();
        campaigns.push({
            ngo: faker.helpers.arrayElement(createdNGOs)._id,
            title: faker.commerce.productName(),
            description: faker.commerce.productDescription(),
            image: faker.image.url(),
            category: faker.helpers.arrayElement(categories),
            location: faker.helpers.arrayElement(cities),
            goalAmount: isFundraising ? faker.finance.amount({ min: 50000, max: 1000000, dec: 0 }) : 0,
            currentAmount: isFundraising ? faker.finance.amount({ min: 0, max: 40000, dec: 0 }) : 0,
            volunteersNeeded: isFundraising ? [] : ['General', 'Specialist', 'Marketing', 'Events'],
            volunteers: isFundraising ? [] : faker.helpers.arrayElements(createdUsers, faker.number.int({ min: 0, max: 10 })).map(u => u._id)
        });
    }

    const createdCampaigns = await Campaign.insertMany(campaigns);
    console.log(`✅ Created ${createdCampaigns.length} sample campaigns`);

    // Create admin user
    await User.create({
      name: 'Admin User',
      email: 'admin@ngoconnect.org',
      password: hashedPassword,
      role: 'admin'
    });
    console.log(`✅ Created admin user: admin@ngoconnect.org`);

    console.log(`
🎉 Database seeded successfully!
`);
    console.log('📝 Test Credentials:');
    console.log('─────────────────────────────────────────');
    console.log('Admin: admin@ngoconnect.org / password123');
    console.log('User: rahul@example.com / password123');
    console.log(`NGO: ${ngos[0].email} / password123`);
    console.log(`─────────────────────────────────────────
`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding database:', err);
    process.exit(1);
  }
};

seedDatabase();