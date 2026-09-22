import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../middlewares/permissionMiddleware.js';

export const seedDatabase = async () => {
  console.log('🧹 [CLEAN SEED] Resetting database to clean production state...');

  // 1. Delete all operational/dummy data
  console.log('  -> Clearing dummy operational records...');
  await prisma.alertRemark.deleteMany({});
  await prisma.alert.deleteMany({});
  await prisma.gunReturn.deleteMany({});
  await prisma.lease.deleteMany({});
  await prisma.gun.deleteMany({});
  await prisma.person.deleteMany({});
  await prisma.ammunitionTransaction.deleteMany({});
  await prisma.ammunition.deleteMany({});
  await prisma.accessoryTransaction.deleteMany({});
  await prisma.accessory.deleteMany({});
  await prisma.auditLog.deleteMany({});

  // 2. Seed Master Roles & Permissions
  console.log('  -> Initializing RBAC roles & permission matrix...');
  for (const [roleName, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {
        permissions: JSON.stringify(permissions),
      },
      create: {
        name: roleName,
        description: `Standard ${roleName} role in armory system`,
        permissions: JSON.stringify(permissions),
      },
    });
  }

  // 3. Seed System Admin & Standard Authorized Users (4 Roles)
  console.log('  -> Initializing authorized system users (4 Users)...');
  const systemUsers = [
    {
      id: 'USR-1',
      name: 'Capt. Elena Vance',
      employeeId: 'EMP-4412',
      email: 'admin@moi.gov.kw',
      password: 'admin123',
      role: 'Administrator',
      department: 'Armory Administration',
      status: 'Active',
    },
    {
      id: 'USR-2',
      name: 'Col. Fahad Al-Enezi',
      employeeId: 'EMP-2201',
      email: 'supervisor@moi.gov.kw',
      password: 'super123',
      role: 'Supervising Officer',
      department: 'Public Security Command',
      status: 'Active',
    },
    {
      id: 'USR-3',
      name: 'Lt. Abdullah Al-Mutairi',
      employeeId: 'EMP-3310',
      email: 'issuer@moi.gov.kw',
      password: 'issue123',
      role: 'Issuing Officer',
      department: 'Equipment Custody',
      status: 'Active',
    },
    {
      id: 'USR-4',
      name: 'Auditor Mariam Al-Kandari',
      employeeId: 'EMP-9901',
      email: 'auditor@moi.gov.kw',
      password: 'audit123',
      role: 'Viewer / Auditor',
      department: 'Internal State Audit',
      status: 'Active',
    },
  ];

  for (const u of systemUsers) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        employeeId: u.employeeId,
        passwordHash,
        role: u.role,
        department: u.department,
        status: u.status,
      },
      create: {
        id: u.id,
        name: u.name,
        employeeId: u.employeeId,
        email: u.email,
        passwordHash,
        role: u.role,
        department: u.department,
        status: u.status,
      },
    });
  }

  // 4. Seed Standard Master Departments
  console.log('  -> Initializing master departments...');
  const departments = [
    { name: 'Public Security Sector', nameAr: 'قطاع الأمن العام', code: 'PSS' },
    { name: 'Criminal Investigations', nameAr: 'الإدارة العامة للمباحث الجنائية', code: 'CID' },
    { name: 'Rescue & Patrol Division', nameAr: 'إدارة دوريات النجدة', code: 'RPD' },
    { name: 'Special Operations Command', nameAr: 'قيادة القوات الخاصة', code: 'SOC' },
    { name: 'Facility & Border Security', nameAr: 'أمن المنشآت والحدود', code: 'FBS' },
  ];
  for (const d of departments) {
    await prisma.department.upsert({
      where: { name: d.name },
      update: { nameAr: d.nameAr, code: d.code },
      create: d,
    });
  }

  // 5. Seed Storage Vault Locations
  console.log('  -> Initializing storage locations...');
  const locations = [
    { name: 'Store Room 1', nameAr: 'غرفة التخزين 1', room: 'Vault-01', type: 'Gun' },
    { name: 'Store Room 2', nameAr: 'غرفة التخزين 2', room: 'Vault-02', type: 'Gun' },
    { name: 'Store Room 3', nameAr: 'غرفة التخزين 3', room: 'Vault-03', type: 'Ammunition' },
    { name: 'Maintenance Workshop', nameAr: 'ورشة الصيانة والتجهيز', room: 'Workshop-A', type: 'General' },
  ];
  for (const l of locations) {
    await prisma.storageLocation.upsert({
      where: { name: l.name },
      update: { nameAr: l.nameAr, room: l.room, type: l.type },
      create: l,
    });
  }

  console.log('🧹 [CLEARED] All operational data (Guns, People, Leases, Bullets, Accessories, Alerts) completely wiped clean!');
  console.log('✅ Database is 100% fresh and ready for manual entry.');
};

if (process.argv[1]?.includes('seed.ts')) {
  seedDatabase()
    .catch((err) => {
      console.error('❌ Seed error:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
