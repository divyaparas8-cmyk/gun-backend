import http from 'http';
import { createApp } from '../app.js';
import { prisma } from '../config/prisma.js';
import { OverdueService } from '../services/overdueService.js';

let server: http.Server;
let baseUrl = '';

const request = async (
  path: string,
  options: {
    method?: string;
    body?: any;
    token?: string;
  } = {}
) => {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: json };
};

const runTests = async () => {
  console.log('===============================================================');
  console.log('🧪 RUNNING COMPREHENSIVE BACKEND E2E & BUSINESS LOGIC TEST SUITE');
  console.log('===============================================================\n');

  const app = createApp();
  server = app.listen(0);
  const address = server.address() as any;
  baseUrl = `http://localhost:${address.port}/api`;

  let adminToken = '';
  let issuerToken = '';
  let supervisorToken = '';
  let viewerToken = '';

  let createdPersonId = '';
  let createdGunId = '';
  let createdAmmoId = '';
  let createdAccId = '';
  let createdLeaseId = '';
  let testAlertId = '';

  let passedCount = 0;
  let failedCount = 0;

  const assert = (testName: string, condition: boolean, detail?: string) => {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} - ${detail || ''}`);
      failedCount++;
    }
  };

  try {
    // 1. Admin Login
    console.log('▶ TEST 1: User Authentication & Role JWT Generation');
    const adminLoginRes = await request('/auth/login', {
      method: 'POST',
      body: { email: 'admin@moi.gov.kw', password: 'admin123' },
    });
    assert('Admin login successful', adminLoginRes.status === 200 && adminLoginRes.body.success === true);
    adminToken = adminLoginRes.body.data?.token;

    // Login other roles
    const issuerRes = await request('/auth/login', {
      method: 'POST',
      body: { email: 'issuer@moi.gov.kw', password: 'issuer123' },
    });
    issuerToken = issuerRes.body.data?.token;

    const supRes = await request('/auth/login', {
      method: 'POST',
      body: { email: 'supervisor@moi.gov.kw', password: 'super123' },
    });
    supervisorToken = supRes.body.data?.token;

    const viewerRes = await request('/auth/login', {
      method: 'POST',
      body: { email: 'auditor@moi.gov.kw', password: 'viewer123' },
    });
    viewerToken = viewerRes.body.data?.token;

    // 2. Create Person
    console.log('\n▶ TEST 2: Register New Officer / Person');
    const uniqueSuffix = Date.now().toString().slice(-6);
    const newPersonRes = await request('/people', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: `Test Officer Tariq ${uniqueSuffix}`,
        employeeId: `EMP-${uniqueSuffix}`,
        phone: '+965 9111 2233',
        department: 'Special Operations Command',
        rank: 'Captain',
        designation: 'Special Response',
        idDocument: `CID-${uniqueSuffix}999`,
        address: 'Salmiya Block 4',
        supervisingOfficer: 'Col. Fahad Al-Enezi',
      },
    });
    assert('Create officer', newPersonRes.status === 201 && newPersonRes.body.success === true);
    createdPersonId = newPersonRes.body.data?.id;

    // 3. Block Person & Test Business Rule
    console.log('\n▶ TEST 3: Block Person & Verify Block Rule');
    const blockRes = await request(`/people/${createdPersonId}/block`, {
      method: 'PATCH',
      token: adminToken,
      body: { blocked: true, reason: 'Temporary administrative disciplinary review' },
    });
    assert('Block officer', blockRes.status === 200 && blockRes.body.data?.status === 'Blocked');

    // 4. Create Gun
    console.log('\n▶ TEST 4: Register New Firearm');
    const newGunRes = await request('/guns', {
      method: 'POST',
      token: adminToken,
      body: {
        serialNumber: `SN-TEST-${uniqueSuffix}`,
        gunType: 'Handgun',
        brand: 'Glock',
        model: 'Glock 19X Tactical',
        calibre: '9x19mm Parabellum',
        location: 'Store Room 1',
        defaultBullets: 30,
        magazineCapacity: 15,
      },
    });
    assert('Create firearm', newGunRes.status === 201 && newGunRes.body.data?.status === 'Available');
    createdGunId = newGunRes.body.data?.id;

    // 5. Create Ammunition
    console.log('\n▶ TEST 5: Create Ammunition & Check Initial Stock');
    const newAmmoRes = await request('/ammunition', {
      method: 'POST',
      token: adminToken,
      body: {
        bulletType: `Special Match Test Ammo ${uniqueSuffix}`,
        calibre: `10mm Auto Test ${uniqueSuffix}`,
        availableQuantity: 500,
        minimumStockLevel: 100,
        storageLocation: 'Store Room 3',
      },
    });
    assert('Create ammunition record', newAmmoRes.status === 201 && newAmmoRes.body.data?.availableQuantity === 500);
    createdAmmoId = newAmmoRes.body.data?.id;

    // 6. Create Accessory
    console.log('\n▶ TEST 6: Register Tactical Accessory');
    const newAccRes = await request('/accessories', {
      method: 'POST',
      token: adminToken,
      body: {
        name: `Tactical Weapon Light ${uniqueSuffix}`,
        category: 'Tactical Gear',
        availableQuantity: 10,
        totalQuantity: 10,
        storageLocation: 'Store Room 1',
      },
    });
    assert('Create accessory', newAccRes.status === 201 && newAccRes.body.data?.availableQuantity === 10);
    createdAccId = newAccRes.body.data?.id;

    // 7. Verify Blocked Person Cannot Receive Firearm
    console.log('\n▶ TEST 7: Attempt Issue to Blocked Person (Must Fail 400)');
    const blockedIssueRes = await request('/leases', {
      method: 'POST',
      token: issuerToken,
      body: {
        personId: createdPersonId,
        gunId: createdGunId,
        issueDate: '2026-09-21',
        issueTime: '08:00 AM',
        expectedReturnDate: '2026-09-21',
        expectedReturnTime: '20:00 PM',
        purpose: 'Patrol',
        locationOfUse: 'Sector 5',
      },
    });
    assert(
      'Issue blocked person rejected with 400',
      blockedIssueRes.status === 400 && blockedIssueRes.body.code === 'PERSON_BLOCKED'
    );

    // Unblock person to continue operational test
    await request(`/people/${createdPersonId}/block`, {
      method: 'PATCH',
      token: adminToken,
      body: { blocked: false },
    });

    // 8. Atomic Issue Gun Transaction
    console.log('\n▶ TEST 8: Atomic Gun Issue Transaction');
    const ammoBefore = await prisma.ammunition.findFirst({ where: { calibre: '9x19mm Parabellum' } });
    const accBefore = await prisma.accessory.findFirst({ where: { id: createdAccId } });

    const issueRes = await request('/leases', {
      method: 'POST',
      token: issuerToken,
      body: {
        personId: createdPersonId,
        gunId: createdGunId,
        gunBulletsIssued: 30,
        issueDate: '2026-09-21',
        issueTime: '08:00 AM',
        expectedReturnDate: '2026-09-21',
        expectedReturnTime: '20:00 PM',
        purpose: 'Special Mission Operation',
        locationOfUse: 'Kuwait Central Station',
        accessoriesIssued: [`Tactical Weapon Light ${uniqueSuffix}`],
      },
    });
    assert('Gun issued successfully', issueRes.status === 201 && issueRes.body.success === true);
    createdLeaseId = issueRes.body.data?.id;

    // 9. Verify Gun Status Became LEASED
    const gunAfterIssue = await prisma.gun.findUnique({ where: { id: createdGunId } });
    assert('Gun status updated to LEASED', gunAfterIssue?.status === 'Leased');

    // 10. Verify Ammunition Stock Decremented
    const ammoAfterIssue = await prisma.ammunition.findFirst({ where: { calibre: '9x19mm Parabellum' } });
    assert(
      'Ammunition stock accurately decremented by 30 rounds',
      ammoAfterIssue?.availableQuantity === (ammoBefore?.availableQuantity || 0) - 30
    );

    // 11. Verify Accessory Stock Decremented
    const accAfterIssue = await prisma.accessory.findFirst({ where: { id: createdAccId } });
    assert(
      'Accessory stock accurately decremented by 1',
      accAfterIssue?.availableQuantity === (accBefore?.availableQuantity || 0) - 1
    );

    // 12. Verify Overdue Background Processing & Duplicate Alert Prevention
    console.log('\n▶ TEST 12: Overdue Processing & Scheduler Evaluation');
    // Artificially set expected return to past
    await prisma.lease.update({
      where: { id: createdLeaseId },
      data: {
        expectedReturnDate: '2024-01-01',
        expectedReturnTime: '08:00 AM',
      },
    });

    const overdueResult1 = await OverdueService.checkAndProcessOverdueLeases();
    assert('Overdue service detected and updated lease', overdueResult1.newAlertsCount >= 1);

    const leaseAfterOverdue = await prisma.lease.findUnique({ where: { id: createdLeaseId } });
    assert('Lease status transitioned to OVERDUE', leaseAfterOverdue?.status === 'Overdue');

    // Run scheduler again -> verify no duplicate alert created
    const overdueResult2 = await OverdueService.checkAndProcessOverdueLeases();
    assert('Duplicate overdue alert prevented on subsequent runs', overdueResult2.newAlertsCount === 0);

    // Fetch the alert ID
    const alertRecord = await prisma.alert.findFirst({
      where: { leaseId: createdLeaseId, type: 'OVERDUE_RETURN' },
    });
    testAlertId = alertRecord?.id || '';
    assert('Overdue alert record exists in database', !!testAlertId);

    // 13. Add Follow-up Remark
    console.log('\n▶ TEST 13: Add Supervisor Follow-up Remark to Alert');
    const remarkRes = await request(`/alerts/${testAlertId}/remarks`, {
      method: 'POST',
      token: supervisorToken,
      body: { remark: 'Officer contacted by dispatch. Weapon is en route for check-in.' },
    });
    assert('Follow-up remark recorded', remarkRes.status === 201 && remarkRes.body.success === true);

    // 14. Atomic Gun Return & Reconciliation Transaction
    console.log('\n▶ TEST 14: Atomic Gun Return & Bullet Reconciliation');
    // Issue was 30 bullets. Return: 10 used, 20 returned.
    const returnRes = await request(`/leases/${createdLeaseId}/return`, {
      method: 'POST',
      token: issuerToken,
      body: {
        actualReturnDate: '2026-09-21',
        actualReturnTime: '18:30 PM',
        gunCondition: 'Good',
        bulletsUsed: 10,
        bulletsReturned: 20,
        accessoriesReturned: [`Tactical Weapon Light ${uniqueSuffix}`],
        notes: 'Weapon inspected, clean and functioning.',
      },
    });
    assert('Return completed successfully', returnRes.status === 200 && returnRes.body.success === true);

    // 15. Verify Lease Status Became RETURNED
    const leaseAfterReturn = await prisma.lease.findUnique({ where: { id: createdLeaseId } });
    assert('Lease status became RETURNED', leaseAfterReturn?.status === 'Returned');

    // 16. Verify Gun Became AVAILABLE
    const gunAfterReturn = await prisma.gun.findUnique({ where: { id: createdGunId } });
    assert('Gun status restored to AVAILABLE', gunAfterReturn?.status === 'Available');

    // 17. Verify Ammo Stock Restocked by 20 rounds
    const ammoAfterReturn = await prisma.ammunition.findFirst({ where: { calibre: '9x19mm Parabellum' } });
    assert(
      'Ammunition stock restored by 20 returned rounds',
      ammoAfterReturn?.availableQuantity === (ammoAfterIssue?.availableQuantity || 0) + 20
    );

    // 18. Verify Accessory Restocked by 1
    const accAfterReturn = await prisma.accessory.findFirst({ where: { id: createdAccId } });
    assert(
      'Accessory available quantity restored',
      accAfterReturn?.availableQuantity === (accBefore?.availableQuantity || 0)
    );

    // 19. Verify Overdue Alert Auto-Resolved
    const alertAfterReturn = await prisma.alert.findUnique({ where: { id: testAlertId } });
    assert('Overdue alert auto-resolved on gun return', alertAfterReturn?.status === 'RESOLVED');

    // 20. Reconcile Validation Test (Mismatch Must Fail 400)
    console.log('\n▶ TEST 20: Ammunition Reconciliation Mismatch Protection');
    // Issue another gun to test mismatch
    const testMismatchIssue = await request('/leases', {
      method: 'POST',
      token: issuerToken,
      body: {
        personId: createdPersonId,
        gunId: createdGunId,
        gunBulletsIssued: 30,
        issueDate: '2026-09-21',
        issueTime: '09:00 AM',
        expectedReturnDate: '2026-09-21',
        expectedReturnTime: '17:00 PM',
        purpose: 'Test',
        locationOfUse: 'Test Range',
      },
    });
    const mismatchLeaseId = testMismatchIssue.body.data?.id;

    const invalidReturnRes = await request(`/leases/${mismatchLeaseId}/return`, {
      method: 'POST',
      token: issuerToken,
      body: {
        actualReturnDate: '2026-09-21',
        actualReturnTime: '17:00 PM',
        gunCondition: 'Good',
        bulletsUsed: 5,
        bulletsReturned: 5, // Total 10 != 30 issued!
      },
    });
    assert(
      'Mismatched ammunition reconciliation rejected with 400',
      invalidReturnRes.status === 400 && invalidReturnRes.body.code === 'AMMO_RECONCILIATION_MISMATCH'
    );

    // Cancel this lease
    await request(`/leases/${mismatchLeaseId}/cancel`, { method: 'PATCH', token: adminToken });

    // 21. Live Dashboard Numbers
    console.log('\n▶ TEST 21: Database-Driven Live Dashboard KPIs');
    const dashRes = await request('/dashboard/summary', { token: adminToken });
    assert('Dashboard summary API returns real metrics', dashRes.status === 200 && typeof dashRes.body.data?.totalGuns === 'number');

    const activityRes = await request('/dashboard/recent-activity', { token: adminToken });
    assert('Recent activity feed populated from audit log', activityRes.status === 200 && Array.isArray(activityRes.body.data));

    // 22. Reports
    console.log('\n▶ TEST 22: Reports & Analytics Endpoints');
    const repAvailable = await request('/reports/available-guns', { token: adminToken });
    assert('Report: available guns', repAvailable.status === 200 && Array.isArray(repAvailable.body.data));

    const repLeased = await request('/reports/leased-guns', { token: adminToken });
    assert('Report: leased guns', repLeased.status === 200 && Array.isArray(repLeased.body.data));

    const repOverdue = await request('/reports/overdue-returns', { token: adminToken });
    assert('Report: overdue returns', repOverdue.status === 200 && Array.isArray(repOverdue.body.data));

    const repAmmo = await request('/reports/ammunition-stock', { token: adminToken });
    assert('Report: ammunition stock', repAmmo.status === 200 && Array.isArray(repAmmo.body.data));

    // 23. RBAC & Fine-Grained Permissions
    console.log('\n▶ TEST 23: RBAC & Permission Enforcement');
    // Viewer should get 403 on POST /people
    const viewerUnauthorizedRes = await request('/people', {
      method: 'POST',
      token: viewerToken,
      body: { fullName: 'Hacker', employeeId: 'EMP-0000', phone: '000', department: 'None', rank: 'None', designation: 'None', idDocument: '000' },
    });
    assert('Viewer blocked with 403 on mutation', viewerUnauthorizedRes.status === 403);

    // Viewer can read reports
    const viewerReadRes = await request('/reports/available-guns', { token: viewerToken });
    assert('Viewer allowed read-only report access', viewerReadRes.status === 200);

    // 24. Immutable Audit Logs
    console.log('\n▶ TEST 24: Immutable Audit Trail');
    const auditRes = await request('/audit', { token: adminToken });
    assert('Audit trail records system mutations', auditRes.status === 200 && auditRes.body.data.length > 0);

    // 25. Prevent Negative Stock
    console.log('\n▶ TEST 25: Negative Stock Prevention');
    const negStockRes = await request(`/ammunition/${createdAmmoId}/adjust-stock`, {
      method: 'POST',
      token: adminToken,
      body: {
        type: 'Bullets Used',
        quantity: 999999, // Exceeds available
      },
    });
    assert('Deduction exceeding available stock blocked with 400', negStockRes.status === 400);

  } catch (error) {
    console.error('Fatal Test Exception:', error);
    failedCount++;
  } finally {
    if (server) server.close();
    console.log('\n===============================================================');
    console.log(`🏁 TEST RESULTS: ${passedCount} PASSED | ${failedCount} FAILED`);
    console.log('===============================================================\n');
    process.exit(failedCount === 0 ? 0 : 1);
  }
};

runTests();
