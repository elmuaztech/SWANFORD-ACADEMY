import { PrismaClient, ConfigCategory } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const settings = [
    {
      key: 'school.name',
      value: 'Swanford Academy',
      description: 'Official Institution Name',
    },
    {
      key: 'school.subtitle',
      value: 'Nursery, Primary & Tahfeez School — Dutse',
      description: 'Official Subtitle / Tagline',
    },
    {
      key: 'school.motto',
      value: '“Illuminating the Path to Success”',
      description: 'Official Institution Motto',
    },
    {
      key: 'school.vision',
      value: 'To become a leading institution recognised for excellence in education, character and discipline, producing highly capable individuals who are respected, responsible and prepared to make a positive impact on society.',
      description: 'Official Swanford Academy Vision Statement',
    },
    {
      key: 'school.mission',
      value: 'To develop highly educated, disciplined, well-mannered and responsible individuals, equipped with the knowledge, character and skills to make a positive impact on society and confidently navigate the challenges of a dynamic world.',
      description: 'Official Swanford Academy Mission Statement',
    },
    {
      key: 'school.core_values',
      value: 'Excellence • Integrity • Discipline • Respect • Responsibility • Good Character • Wisdom • Leadership',
      description: 'Official Swanford Academy Core Values',
    },
    {
      key: 'school.address',
      value: 'PLOT 212, DR NUHU MUHAMMADU SANUSI WAY, DUTSE, JIGAWA STATE',
      description: 'Official Campus Physical Address',
    },
    {
      key: 'school.state',
      value: 'Jigawa State',
      description: 'State Location',
    },
    {
      key: 'school.country',
      value: 'Nigeria',
      description: 'Country',
    },
    {
      key: 'school.phone_primary',
      value: '+234 803 695 0352',
      description: 'Primary Official Contact Telephone',
    },
    {
      key: 'school.email',
      value: 'info@swanfordacademy.edu.ng',
      description: 'Official Inquiries and Administration Email',
    },
    {
      key: 'school.proprietor',
      value: 'Muhammad Kanti, Proprietor',
      description: 'Proprietor / Management Leadership',
    },
    {
      key: 'school.website',
      value: 'https://swanfordacademy.edu.ng',
      description: 'Official Website Domain',
    },
    {
      key: 'school.bank_name',
      value: 'Stanbic IBTC Bank',
      description: 'Official Settlement Bank',
    },
    {
      key: 'school.bank_account_name',
      value: 'Swanford Academy Ltd',
      description: 'Official Settlement Account Name',
    },
    {
      key: 'school.bank_account_number',
      value: '0034567890',
      description: 'Official Settlement Account Number',
    },
    {
      key: 'school.primary_color',
      value: '#800020',
      description: 'Primary Institution Maroon Branding Color',
    },
    {
      key: 'school.secondary_color',
      value: '#D4AF37',
      description: 'Secondary Institution Gold Branding Color',
    },
    {
      key: 'school.timezone',
      value: 'Africa/Lagos',
      description: 'Official Operating Timezone',
    },
  ];

  console.log('Syncing official Swanford Academy settings into PostgreSQL system_configs...');

  for (const s of settings) {
    await prisma.systemConfig.upsert({
      where: { key: s.key },
      update: {
        value: s.value,
        description: s.description,
        category: ConfigCategory.GENERAL,
      },
      create: {
        key: s.key,
        value: s.value,
        description: s.description,
        category: ConfigCategory.GENERAL,
      },
    });
    console.log(`✓ ${s.key} = ${s.value}`);
  }

  console.log('\nAll official settings successfully synced to PostgreSQL!');
}

main()
  .catch((err) => {
    console.error('Failed to sync school profile:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
