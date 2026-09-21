import { prisma } from '../config/prisma.js';

async function main() {
  const guns = await prisma.gun.findMany();
  const people = await prisma.person.findMany();
  const leases = await prisma.lease.findMany();
  const ammo = await prisma.ammunition.findMany();

  console.log('=== DATABASE STATUS ===');
  console.log('Guns in DB:', guns.length, guns.map((g: { model: string; serialNumber: string }) => ({ model: g.model, serial: g.serialNumber })));
  console.log('People in DB:', people.length, people.map((p: { fullName: string; employeeId: string }) => ({ name: p.fullName, empId: p.employeeId })));
  console.log('Leases in DB:', leases.length);
  console.log('Ammunition in DB:', ammo.length);
}

main().finally(async () => {
  await prisma.$disconnect();
});
