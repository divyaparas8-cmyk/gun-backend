import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../middlewares/permissionMiddleware.js';

export const populateComprehensiveData = async () => {
  console.log('🚀 [SEED] Populating database with rich official Kuwait MOI armory data...');

  // 0. Clean old operational records
  await prisma.alertRemark.deleteMany({});
  await prisma.alert.deleteMany({});
  await prisma.gunReturn.deleteMany({});
  await prisma.lease.deleteMany({});
  await prisma.person.deleteMany({});
  await prisma.gun.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.ammunitionTransaction.deleteMany({});
  await prisma.ammunition.deleteMany({});
  await prisma.accessoryTransaction.deleteMany({});
  await prisma.accessory.deleteMany({});

  // 1. Roles
  console.log('  -> Seeding RBAC Roles...');
  for (const [roleName, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: { permissions: JSON.stringify(permissions) },
      create: {
        name: roleName,
        description: `Standard ${roleName} role with tailored permissions`,
        permissions: JSON.stringify(permissions),
      },
    });
  }

  // 2. Users (4 Authorized System Roles)
  console.log('  -> Seeding System Users (4 Users)...');
  const users = [
    {
      id: 'usr_admin_01',
      name: 'Capt. Elena Vance',
      employeeId: 'EMP-4412',
      email: 'admin@moi.gov.kw',
      password: 'admin123',
      role: 'Administrator',
      department: 'Armory Administration',
      status: 'Active',
    },
    {
      id: 'usr_sup_02',
      name: 'Col. Fahad Al-Enezi',
      employeeId: 'EMP-2201',
      email: 'supervisor@moi.gov.kw',
      password: 'super123',
      role: 'Supervising Officer',
      department: 'Public Security Command',
      status: 'Active',
    },
    {
      id: 'usr_iss_03',
      name: 'Lt. Abdullah Al-Mutairi',
      employeeId: 'EMP-3310',
      email: 'issuer@moi.gov.kw',
      password: 'issue123',
      role: 'Issuing Officer',
      department: 'Equipment Custody',
      status: 'Active',
    },
    {
      id: 'usr_aud_04',
      name: 'Auditor Mariam Al-Kandari',
      employeeId: 'EMP-9901',
      email: 'auditor@moi.gov.kw',
      password: 'audit123',
      role: 'Viewer / Auditor',
      department: 'Internal State Audit',
      status: 'Active',
    },
  ];

  for (const u of users) {
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

  // 3. Master Departments
  console.log('  -> Seeding Master Departments...');
  const departments = [
    { name: 'Special Security Forces - Specialized Training Center', nameAr: 'الامداد - مركز التدريب التخصصي قطاع الأمن الخاص', code: 'SSF-TC' },
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

  // 4. Storage Locations
  console.log('  -> Seeding Vault Locations...');
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

  // 5. Authorized People / Officers (Exactly 3 Officers)
  console.log('  -> Seeding Authorized Personnel (3 Officers)...');
  const officers = [
    {
      id: 'person_01',
      fullName: 'Maj. Nasser Al-Sabah',
      fullNameAr: 'رائد / ناصر الصباح',
      employeeId: 'KWT-9041',
      phone: '+965 9988 1122',
      department: 'Special Security Forces - Specialized Training Center',
      departmentAr: 'الامداد - مركز التدريب التخصصي قطاع الأمن الخاص',
      rank: 'Major',
      rankAr: 'رائد',
      designation: 'Specialized Training Unit Commander',
      designationAr: 'قائد وحدة التدريب التخصصي والإمداد',
      idDocument: 'CID-28801019921',
      address: 'Al-Bayan Sector, Kuwait',
      addressAr: 'منطقة بيان، الكويت',
      supervisingOfficer: 'Col. Fahad Al-Enezi',
      status: 'Active',
    },
    {
      id: 'person_02',
      fullName: 'Capt. Tariq Al-Otaibi',
      fullNameAr: 'نقيب / طارق العتيبي',
      employeeId: 'KWT-4418',
      phone: '+965 9772 3344',
      department: 'Rescue & Patrol Division',
      departmentAr: 'إدارة دوريات النجدة',
      rank: 'Captain',
      rankAr: 'نقيب',
      designation: 'Capital Highway Patrol Lead',
      designationAr: 'مسؤول دوريات طرق العاصمة',
      idDocument: 'CID-29104048832',
      address: 'Shamiya, Block 2',
      addressAr: 'الشامية، قطعة 2',
      supervisingOfficer: 'Col. Fahad Al-Enezi',
      status: 'Active',
    },
    {
      id: 'person_03',
      fullName: 'Lt. Bader Al-Rashidi',
      fullNameAr: 'ملازم أول / بدر الرشيدي',
      employeeId: 'KWT-7731',
      phone: '+965 9445 6677',
      department: 'Public Security Sector',
      departmentAr: 'قطاع الأمن العام',
      rank: 'First Lieutenant',
      rankAr: 'ملازم أول',
      designation: 'Sector Duty Officer',
      designationAr: 'ضابط خفر القطاع',
      idDocument: 'CID-29408087741',
      address: 'Hawalli Sector',
      addressAr: 'محافظة حولي',
      supervisingOfficer: 'Col. Fahad Al-Enezi',
      status: 'Active',
    },
  ];

  for (const p of officers) {
    await prisma.person.upsert({
      where: { employeeId: p.employeeId },
      update: p,
      create: p,
    });
  }

  // 6. Firearms / Guns Inventory (Exactly 2 Weapons)
  console.log('  -> Seeding Firearms Inventory (2 Guns)...');
  const guns = [
    {
      id: 'gun_g19_01',
      serialNumber: 'GLK-19X-8821',
      gunType: 'Handgun',
      brand: 'Glock',
      model: 'Glock 19X Tactical',
      modelAr: 'غلوك 19X التكتيكي',
      calibre: '9x19mm Parabellum',
      purchaseDate: '2023-01-15',
      condition: 'Excellent',
      location: 'Store Room 1',
      locationAr: 'غرفة التخزين 1',
      status: 'Available',
      magazineCapacity: 17,
      defaultBullets: 34,
      notes: 'Standard tactical sidearm with tritium night sights.',
    },
    {
      id: 'gun_m4a1_04',
      serialNumber: 'COLT-M4-7721',
      gunType: 'Rifle',
      brand: 'Colt',
      model: 'M4A1 Carbine 5.56',
      modelAr: 'كولت M4A1 كاربين',
      calibre: '5.56x45mm NATO',
      purchaseDate: '2023-06-01',
      condition: 'Excellent',
      location: 'Store Room 2',
      locationAr: 'غرفة التخزين 2',
      status: 'Available',
      magazineCapacity: 30,
      defaultBullets: 60,
      notes: 'Assigned with holographic optic and tactical sling.',
    },
  ];

  for (const g of guns) {
    await prisma.gun.upsert({
      where: { serialNumber: g.serialNumber },
      update: g,
      create: g,
    });
  }

  // 7. Ammunition Stock
  console.log('  -> Seeding Ammunition Stock...');
  const ammunitions = [
    {
      id: 'ammo_9mm',
      bulletType: '9x19mm Parabellum FMJ 124gr',
      bulletTypeAr: 'ذخيرة 9 ملم بارابيلوم خارقة',
      calibre: '9x19mm Parabellum',
      availableQuantity: 4850,
      minimumStockLevel: 1000,
      storageLocation: 'Store Room 3',
      storageLocationAr: 'غرفة التخزين 3',
      condition: 'Good',
      status: 'Healthy',
    },
    {
      id: 'ammo_556',
      bulletType: '5.56x45mm NATO SS109 / M855',
      bulletTypeAr: 'ذخيرة 5.56 ملم ناتو قياسية',
      calibre: '5.56x45mm NATO',
      availableQuantity: 7200,
      minimumStockLevel: 2000,
      storageLocation: 'Store Room 3',
      storageLocationAr: 'غرفة التخزين 3',
      condition: 'Good',
      status: 'Healthy',
    },
  ];

  for (const a of ammunitions) {
    await prisma.ammunition.upsert({
      where: { calibre: a.calibre },
      update: a,
      create: a,
    });
  }

  // 8. Tactical Accessories
  console.log('  -> Seeding Tactical Accessories...');
  const accessories = [
    {
      id: 'acc_mag_9mm',
      name: 'Glock 17/19 9mm Standard Magazine (17-round)',
      nameAr: 'مخزن مسدس غلوك 17/19 سعة 17 طلقة',
      category: 'Magazines',
      categoryAr: 'مخازن ذخيرة',
      availableQuantity: 45,
      totalQuantity: 50,
      condition: 'Good',
      storageLocation: 'Store Room 1',
    },
    {
      id: 'acc_mag_556',
      name: 'Magpul PMAG 30-round 5.56x45mm Magazine',
      nameAr: 'مخزن ماغبول 30 طلقة لبندقية M4',
      category: 'Magazines',
      categoryAr: 'مخازن ذخيرة',
      availableQuantity: 38,
      totalQuantity: 40,
      condition: 'Good',
      storageLocation: 'Store Room 2',
    },
    {
      id: 'acc_holster_safariland',
      name: 'Safariland 6360 Level III Duty Retention Holster',
      nameAr: 'جراب مسدس سافاريلاند تكتيكي Level III',
      category: 'Holsters',
      categoryAr: 'جرابات أسلحة',
      availableQuantity: 28,
      totalQuantity: 30,
      condition: 'Good',
      storageLocation: 'Store Room 1',
    },
    {
      id: 'acc_helmet_l4',
      name: 'Level IV Ballistic Combat Helmet with NVG Mount',
      nameAr: 'خوذة بالستية تكتيكية Level IV مع قاعدة رؤية ليلية',
      category: 'Helmets',
      categoryAr: 'خوذ بالستية',
      availableQuantity: 18,
      totalQuantity: 20,
      condition: 'Good',
      storageLocation: 'Store Room 2',
    },
    {
      id: 'acc_vest_tac',
      name: 'Protective Tactical Body Armor Vest with MOLLE',
      nameAr: 'سترة بالستية واقية من الرصاص بنظام مولي',
      category: 'Body Armor & Vests',
      categoryAr: 'سترات واقية',
      availableQuantity: 22,
      totalQuantity: 25,
      condition: 'Good',
      storageLocation: 'Store Room 2',
    },
  ];

  for (const acc of accessories) {
    await prisma.accessory.upsert({
      where: { id: acc.id },
      update: acc,
      create: acc,
    });
  }

  // 9. Sample Active Lease Record
  console.log('  -> Seeding Sample Active Leases...');
  const todayStr = new Date().toISOString().split('T')[0];
  const sampleLease = {
    id: 'lease_active_01',
    personId: 'person_01',
    gunId: 'gun_g19_01',
    gunBulletsIssued: 34,
    pistolId: null,
    pistolBulletsIssued: 0,
    bulletsIssued: 34,
    issueDate: todayStr,
    issueTime: '08:00 AM',
    expectedReturnDate: todayStr,
    expectedReturnTime: '08:00 PM',
    purpose: 'VIP Escort / Protection',
    locationOfUse: 'Kuwait City - Arabian Gulf Sector',
    accessoriesIssuedJson: JSON.stringify(['2x Standard Magazines', '1x Duty Retention Holster']),
    issuingOfficer: 'Capt. Elena Vance',
    receiverSignatureConfirmed: true,
    status: 'Active',
    notes: 'Official armed escort duty.',
  };

  await prisma.lease.upsert({
    where: { id: sampleLease.id },
    update: sampleLease,
    create: sampleLease,
  });

  // Mark gun as leased
  await prisma.gun.update({
    where: { id: 'gun_g19_01' },
    data: { status: 'Leased' },
  });

  console.log('✅ [SUCCESS] Complete Kuwait MOI armory dataset successfully seeded into database!');
};

if (process.argv[1]?.includes('populateData.ts')) {
  populateComprehensiveData()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ Populate error:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
