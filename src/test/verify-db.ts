import { prisma } from '../config/prisma.js';

async function main() {
  console.log('🔍 Checking MySQL Tables & Schema in armory_db...\n');

  const tables: any = await prisma.$queryRawUnsafe('SHOW TABLES');
  console.log('✅ Found', tables.length, 'tables in armory_db:');
  tables.forEach((t: any, idx: number) => {
    const tableName = Object.values(t)[0];
    console.log(`  ${idx + 1}. ${tableName}`);
  });

  console.log('\n📊 Row Counts:');
  console.log('  - Users:', await prisma.user.count());
  console.log('  - Roles:', await prisma.role.count());
  console.log('  - Departments:', await prisma.department.count());
  console.log('  - Storage Locations:', await prisma.storageLocation.count());
  console.log('  - People (Officers):', await prisma.person.count());
  console.log('  - Guns (Firearms):', await prisma.gun.count());
  console.log('  - Ammunition Types:', await prisma.ammunition.count());
  console.log('  - Ammunition Transactions:', await prisma.ammunitionTransaction.count());
  console.log('  - Tactical Accessories:', await prisma.accessory.count());
  console.log('  - Leases (Issue Records):', await prisma.lease.count());
  console.log('  - Gun Returns:', await prisma.gunReturn.count());
  console.log('  - Alerts:', await prisma.alert.count());
  console.log('  - Audit Logs:', await prisma.auditLog.count());
  
  await prisma.$disconnect();
}

main().catch(console.error);
