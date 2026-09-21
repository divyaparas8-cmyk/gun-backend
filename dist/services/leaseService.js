import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { logAudit } from './auditService.js';
export class LeaseService {
    /**
     * ATOMIC ISSUE GUN TRANSACTION
     */
    static async issueGun(req, input) {
        const userId = req.user?.id;
        const issuingOfficerName = req.user?.name || 'Authorized Armory Officer';
        // 1. Validate Person
        const person = await prisma.person.findUnique({
            where: { id: input.personId },
        });
        if (!person) {
            throw new AppError(`Person with ID '${input.personId}' does not exist.`, 404, 'PERSON_NOT_FOUND');
        }
        if (person.status === 'Inactive') {
            throw new AppError(`Cannot issue firearms to inactive personnel (${person.fullName}).`, 400, 'PERSON_INACTIVE');
        }
        if (person.status === 'Blocked') {
            throw new AppError(`Person ${person.fullName} is BLOCKED from receiving firearms. Reason: ${person.blockedReason || 'Administrative hold'}`, 400, 'PERSON_BLOCKED');
        }
        // 2. Validate Primary Gun
        const primaryGun = await prisma.gun.findUnique({
            where: { id: input.gunId },
        });
        if (!primaryGun) {
            throw new AppError(`Primary Gun with ID '${input.gunId}' not found.`, 404, 'GUN_NOT_FOUND');
        }
        if (primaryGun.status !== 'Available') {
            throw new AppError(`Primary Gun '${primaryGun.model}' (${primaryGun.serialNumber}) is currently ${primaryGun.status}. Only AVAILABLE firearms can be issued.`, 400, 'GUN_NOT_AVAILABLE');
        }
        // 3. Validate Secondary Gun if provided
        let secondaryGun = null;
        if (input.pistolId && input.pistolId !== input.gunId) {
            secondaryGun = await prisma.gun.findUnique({
                where: { id: input.pistolId },
            });
            if (!secondaryGun) {
                throw new AppError(`Secondary firearm with ID '${input.pistolId}' not found.`, 404, 'GUN_NOT_FOUND');
            }
            if (secondaryGun.status !== 'Available') {
                throw new AppError(`Secondary firearm '${secondaryGun.model}' is currently ${secondaryGun.status}. Must be AVAILABLE.`, 400, 'SECONDARY_GUN_NOT_AVAILABLE');
            }
        }
        // Compute total bullets
        const primaryBullets = input.gunBulletsIssued ?? primaryGun.defaultBullets ?? 30;
        const secondaryBullets = secondaryGun ? (input.pistolBulletsIssued ?? secondaryGun.defaultBullets ?? 30) : 0;
        const totalBulletsRequested = input.bulletsIssued ?? (primaryBullets + secondaryBullets);
        // 4. Validate Ammunition Stock
        const primaryAmmo = await prisma.ammunition.findFirst({
            where: { calibre: primaryGun.calibre },
        });
        if (primaryBullets > 0) {
            if (!primaryAmmo) {
                throw new AppError(`No ammunition record found for calibre '${primaryGun.calibre}'.`, 400, 'AMMO_NOT_FOUND');
            }
            if (primaryAmmo.availableQuantity < primaryBullets) {
                throw new AppError(`Insufficient ammunition stock for ${primaryGun.calibre}. Available: ${primaryAmmo.availableQuantity}, Requested: ${primaryBullets}`, 400, 'INSUFFICIENT_AMMO_STOCK');
            }
        }
        let secondaryAmmo = null;
        if (secondaryGun && secondaryBullets > 0) {
            secondaryAmmo = await prisma.ammunition.findFirst({
                where: { calibre: secondaryGun.calibre },
            });
            if (!secondaryAmmo) {
                throw new AppError(`No ammunition record found for calibre '${secondaryGun.calibre}'.`, 400, 'AMMO_NOT_FOUND');
            }
            if (secondaryAmmo.availableQuantity < secondaryBullets) {
                throw new AppError(`Insufficient secondary ammunition stock for ${secondaryGun.calibre}. Available: ${secondaryAmmo.availableQuantity}, Requested: ${secondaryBullets}`, 400, 'INSUFFICIENT_AMMO_STOCK');
            }
        }
        // 5. ATOMIC DATABASE TRANSACTION
        const result = await prisma.$transaction(async (tx) => {
            // 5.1 Create Lease
            const lease = await tx.lease.create({
                data: {
                    personId: person.id,
                    gunId: primaryGun.id,
                    gunBulletsIssued: primaryBullets,
                    pistolId: secondaryGun ? secondaryGun.id : null,
                    pistolBulletsIssued: secondaryBullets,
                    weaponsJson: input.weapons ? JSON.stringify(input.weapons) : null,
                    issueDate: input.issueDate,
                    issueTime: input.issueTime,
                    expectedReturnDate: input.expectedReturnDate,
                    expectedReturnTime: input.expectedReturnTime,
                    purpose: input.purpose,
                    locationOfUse: input.locationOfUse,
                    bulletsIssued: totalBulletsRequested,
                    accessoriesIssuedJson: JSON.stringify(input.accessoriesIssued || []),
                    issuingOfficer: issuingOfficerName,
                    receiverSignatureConfirmed: true,
                    status: 'Active',
                    notes: input.notes,
                },
                include: {
                    person: true,
                    gun: true,
                    pistol: true,
                },
            });
            // 5.2 Update Primary Gun status -> Leased
            await tx.gun.update({
                where: { id: primaryGun.id },
                data: { status: 'Leased' },
            });
            // 5.3 Update Secondary Gun status -> Leased
            if (secondaryGun) {
                await tx.gun.update({
                    where: { id: secondaryGun.id },
                    data: { status: 'Leased' },
                });
            }
            // 5.4 Deduct Primary Ammunition & Create Ammunition Transaction
            if (primaryAmmo && primaryBullets > 0) {
                const newPrimaryStock = primaryAmmo.availableQuantity - primaryBullets;
                await tx.ammunition.update({
                    where: { id: primaryAmmo.id },
                    data: {
                        availableQuantity: newPrimaryStock,
                        status: newPrimaryStock < primaryAmmo.minimumStockLevel ? 'Low Stock' : 'Healthy',
                    },
                });
                await tx.ammunitionTransaction.create({
                    data: {
                        ammunitionId: primaryAmmo.id,
                        type: 'Bullets Issued',
                        quantity: primaryBullets,
                        reference: `REF-${lease.id} (${person.fullName} / ${primaryGun.model})`,
                        performedBy: issuingOfficerName,
                        userId: userId || null,
                        notes: `Dispatched with lease #${lease.id}`,
                    },
                });
                // Trigger Low Stock alert if needed
                if (newPrimaryStock < primaryAmmo.minimumStockLevel) {
                    const existingAlert = await tx.alert.findFirst({
                        where: {
                            ammunitionId: primaryAmmo.id,
                            type: 'LOW_AMMUNITION_STOCK',
                            status: 'OPEN',
                        },
                    });
                    if (!existingAlert) {
                        await tx.alert.create({
                            data: {
                                ammunitionId: primaryAmmo.id,
                                type: 'LOW_AMMUNITION_STOCK',
                                severity: 'HIGH',
                                status: 'OPEN',
                                message: `Low Stock Warning: Ammunition '${primaryAmmo.bulletType}' (${primaryAmmo.calibre}) has ${newPrimaryStock} rounds remaining (threshold: ${primaryAmmo.minimumStockLevel}).`,
                            },
                        });
                    }
                }
            }
            // 5.5 Deduct Secondary Ammunition if applicable
            if (secondaryAmmo && secondaryBullets > 0) {
                const newSecStock = secondaryAmmo.availableQuantity - secondaryBullets;
                await tx.ammunition.update({
                    where: { id: secondaryAmmo.id },
                    data: {
                        availableQuantity: newSecStock,
                        status: newSecStock < secondaryAmmo.minimumStockLevel ? 'Low Stock' : 'Healthy',
                    },
                });
                await tx.ammunitionTransaction.create({
                    data: {
                        ammunitionId: secondaryAmmo.id,
                        type: 'Bullets Issued',
                        quantity: secondaryBullets,
                        reference: `REF-${lease.id} (${person.fullName} / ${secondaryGun.model})`,
                        performedBy: issuingOfficerName,
                        userId: userId || null,
                        notes: `Secondary sidearm ammo dispatched with lease #${lease.id}`,
                    },
                });
            }
            // 5.6 Decrement Accessories Stock & Record Accessory Transactions
            if (input.accessoriesIssued && input.accessoriesIssued.length > 0) {
                for (const accName of input.accessoriesIssued) {
                    // Find matching accessory in DB
                    const accItem = await tx.accessory.findFirst({
                        where: {
                            OR: [
                                { name: { contains: accName } },
                                { name: accName },
                            ],
                        },
                    });
                    if (accItem && accItem.availableQuantity > 0) {
                        await tx.accessory.update({
                            where: { id: accItem.id },
                            data: {
                                availableQuantity: Math.max(0, accItem.availableQuantity - 1),
                            },
                        });
                        await tx.accessoryTransaction.create({
                            data: {
                                accessoryId: accItem.id,
                                type: 'Issued',
                                quantity: 1,
                                reference: `REF-${lease.id} (${person.fullName})`,
                                performedBy: issuingOfficerName,
                                userId: userId || null,
                                notes: `Issued with lease #${lease.id}`,
                            },
                        });
                    }
                }
            }
            return lease;
        });
        // 6. Append-only Audit Log
        await logAudit({
            req,
            action: 'CREATE_LEASE',
            entityType: 'Lease',
            entityId: result.id,
            newValue: {
                leaseId: result.id,
                person: person.fullName,
                primaryGun: primaryGun.model,
                secondaryGun: secondaryGun ? secondaryGun.model : null,
                bulletsIssued: totalBulletsRequested,
            },
        });
        return result;
    }
    /**
     * ATOMIC RETURN GUN & RECONCILIATION TRANSACTION
     */
    static async returnGun(req, leaseId, input) {
        const userId = req.user?.id;
        const receivingOfficerName = req.user?.name || 'Authorized Armory Officer';
        // 1. Validate Lease
        const lease = await prisma.lease.findUnique({
            where: { id: leaseId },
            include: {
                person: true,
                gun: true,
                pistol: true,
                returnRecord: true,
            },
        });
        if (!lease) {
            throw new AppError(`Lease with ID '${leaseId}' not found.`, 404, 'LEASE_NOT_FOUND');
        }
        if (lease.status === 'Returned') {
            throw new AppError(`Lease #${leaseId} has already been returned.`, 400, 'LEASE_ALREADY_RETURNED');
        }
        if (lease.status === 'Cancelled') {
            throw new AppError(`Lease #${leaseId} was cancelled. Cannot process return.`, 400, 'LEASE_CANCELLED');
        }
        // 2. Validate Bullet Reconciliation
        const totalIssued = lease.bulletsIssued;
        const bulletsUsed = input.bulletsUsed || 0;
        const bulletsReturned = input.bulletsReturned || 0;
        if (bulletsUsed < 0 || bulletsReturned < 0) {
            throw new AppError('Bullet quantities cannot be negative.', 400, 'INVALID_BULLET_COUNT');
        }
        if (bulletsUsed + bulletsReturned !== totalIssued) {
            throw new AppError(`Ammunition reconciliation mismatch: Bullets issued (${totalIssued}) must equal used (${bulletsUsed}) + returned (${bulletsReturned}).`, 400, 'AMMO_RECONCILIATION_MISMATCH');
        }
        // 3. ATOMIC TRANSACTION FOR RETURN
        const result = await prisma.$transaction(async (tx) => {
            // 3.1 Create GunReturn Record
            const gunReturn = await tx.gunReturn.create({
                data: {
                    leaseId: lease.id,
                    actualReturnDate: input.actualReturnDate,
                    actualReturnTime: input.actualReturnTime,
                    gunCondition: input.gunCondition,
                    bulletsIssued: totalIssued,
                    bulletsUsed: bulletsUsed,
                    bulletsReturned: bulletsReturned,
                    gunBulletsIssued: input.gunBulletsIssued || lease.gunBulletsIssued || 0,
                    gunBulletsUsed: input.gunBulletsUsed || 0,
                    gunBulletsReturned: input.gunBulletsReturned || 0,
                    pistolBulletsIssued: input.pistolBulletsIssued || lease.pistolBulletsIssued || 0,
                    pistolBulletsUsed: input.pistolBulletsUsed || 0,
                    pistolBulletsReturned: input.pistolBulletsReturned || 0,
                    weaponsJson: input.weapons ? JSON.stringify(input.weapons) : null,
                    accessoriesIssuedJson: JSON.stringify(input.accessoriesIssued || JSON.parse(lease.accessoriesIssuedJson || '[]')),
                    accessoriesReturnedJson: JSON.stringify(input.accessoriesReturned || []),
                    missingAccessories: input.missingAccessories || null,
                    damageInformation: input.damageInformation || null,
                    returnReceivedBy: receivingOfficerName,
                    receiverSignatureConfirmed: true,
                    notes: input.notes || null,
                },
            });
            // 3.2 Update Lease status -> Returned
            await tx.lease.update({
                where: { id: lease.id },
                data: { status: 'Returned' },
            });
            // 3.3 Update Primary Gun Status & Condition
            const primaryNewStatus = input.gunCondition === 'Damaged' || input.gunCondition === 'Needs Cleaning'
                ? 'Maintenance'
                : 'Available';
            await tx.gun.update({
                where: { id: lease.gunId },
                data: {
                    status: primaryNewStatus,
                    condition: input.gunCondition === 'Damaged' ? 'Damaged' : input.gunCondition === 'Needs Cleaning' ? 'Needs Cleaning' : 'Good',
                },
            });
            // 3.4 Update Secondary Gun if any
            if (lease.pistolId) {
                await tx.gun.update({
                    where: { id: lease.pistolId },
                    data: {
                        status: 'Available',
                        condition: 'Good',
                    },
                });
            }
            // 3.5 Reconcile Primary Ammunition
            const primaryAmmo = await tx.ammunition.findFirst({
                where: { calibre: lease.gun.calibre },
            });
            if (primaryAmmo && bulletsReturned > 0) {
                const restockedQuantity = primaryAmmo.availableQuantity + bulletsReturned;
                await tx.ammunition.update({
                    where: { id: primaryAmmo.id },
                    data: {
                        availableQuantity: restockedQuantity,
                        status: restockedQuantity >= primaryAmmo.minimumStockLevel ? 'Healthy' : 'Low Stock',
                    },
                });
                await tx.ammunitionTransaction.create({
                    data: {
                        ammunitionId: primaryAmmo.id,
                        type: 'Bullets Returned',
                        quantity: bulletsReturned,
                        reference: `REF-${lease.id} (${lease.person.fullName})`,
                        performedBy: receivingOfficerName,
                        userId: userId || null,
                        notes: `Reconciled from lease return #${lease.id}. (${bulletsUsed} fired/used)`,
                    },
                });
            }
            if (primaryAmmo && bulletsUsed > 0) {
                await tx.ammunitionTransaction.create({
                    data: {
                        ammunitionId: primaryAmmo.id,
                        type: 'Bullets Used',
                        quantity: bulletsUsed,
                        reference: `REF-${lease.id} (${lease.person.fullName})`,
                        performedBy: receivingOfficerName,
                        userId: userId || null,
                        notes: `Fired / expended during duty. Lease #${lease.id}`,
                    },
                });
            }
            // 3.6 Reconcile Accessories (Restock returned items)
            if (input.accessoriesReturned && input.accessoriesReturned.length > 0) {
                for (const accName of input.accessoriesReturned) {
                    const accItem = await tx.accessory.findFirst({
                        where: {
                            OR: [
                                { name: { contains: accName } },
                                { name: accName },
                            ],
                        },
                    });
                    if (accItem) {
                        await tx.accessory.update({
                            where: { id: accItem.id },
                            data: {
                                availableQuantity: Math.min(accItem.totalQuantity, accItem.availableQuantity + 1),
                            },
                        });
                        await tx.accessoryTransaction.create({
                            data: {
                                accessoryId: accItem.id,
                                type: 'Returned',
                                quantity: 1,
                                reference: `REF-${lease.id} (${lease.person.fullName})`,
                                performedBy: receivingOfficerName,
                                userId: userId || null,
                                notes: `Returned from lease #${lease.id}`,
                            },
                        });
                    }
                }
            }
            // 3.7 Handle Missing Accessories Alert
            if (input.missingAccessories && input.missingAccessories.trim() !== '') {
                await tx.alert.create({
                    data: {
                        leaseId: lease.id,
                        type: 'MISSING_ACCESSORY',
                        severity: 'HIGH',
                        status: 'OPEN',
                        message: `Missing Gear Alert: ${lease.person.fullName} returned lease #${lease.id} with missing items: ${input.missingAccessories}`,
                    },
                });
            }
            // 3.8 Handle Damaged Gun Alert
            if (input.gunCondition === 'Damaged') {
                await tx.alert.create({
                    data: {
                        leaseId: lease.id,
                        gunId: lease.gunId,
                        type: 'DAMAGED_GUN',
                        severity: 'CRITICAL',
                        status: 'OPEN',
                        message: `Damaged Firearm Alert: Gun '${lease.gun.model}' (${lease.gun.serialNumber}) returned damaged from lease #${lease.id}. Info: ${input.damageInformation || 'Unspecified damage'}`,
                    },
                });
            }
            // 3.9 Auto-resolve any open OVERDUE_RETURN alerts for this lease
            await tx.alert.updateMany({
                where: {
                    leaseId: lease.id,
                    type: 'OVERDUE_RETURN',
                    status: 'OPEN',
                },
                data: {
                    status: 'RESOLVED',
                    resolvedAt: new Date(),
                    resolvedBy: receivingOfficerName,
                },
            });
            return gunReturn;
        });
        // 4. Audit Log
        await logAudit({
            req,
            action: 'PROCESS_RETURN',
            entityType: 'Lease',
            entityId: lease.id,
            newValue: {
                leaseId: lease.id,
                gunCondition: input.gunCondition,
                bulletsReturned: bulletsReturned,
                bulletsUsed: bulletsUsed,
                receivedBy: receivingOfficerName,
            },
        });
        return result;
    }
    /**
     * CANCEL LEASE (if created in error)
     */
    static async cancelLease(req, leaseId) {
        const userId = req.user?.id;
        const officer = req.user?.name || 'Authorized Officer';
        const lease = await prisma.lease.findUnique({
            where: { id: leaseId },
            include: { gun: true, pistol: true, person: true },
        });
        if (!lease) {
            throw new AppError(`Lease #${leaseId} not found.`, 404, 'LEASE_NOT_FOUND');
        }
        if (lease.status === 'Returned') {
            throw new AppError('Cannot cancel an already returned lease.', 400, 'INVALID_STATE');
        }
        if (lease.status === 'Cancelled') {
            throw new AppError('Lease is already cancelled.', 400, 'ALREADY_CANCELLED');
        }
        const result = await prisma.$transaction(async (tx) => {
            // 1. Mark Lease Cancelled
            const updated = await tx.lease.update({
                where: { id: lease.id },
                data: { status: 'Cancelled' },
            });
            // 2. Revert Gun Status
            await tx.gun.update({
                where: { id: lease.gunId },
                data: { status: 'Available' },
            });
            if (lease.pistolId) {
                await tx.gun.update({
                    where: { id: lease.pistolId },
                    data: { status: 'Available' },
                });
            }
            // 3. Restock Ammunition
            if (lease.bulletsIssued > 0) {
                const ammo = await tx.ammunition.findFirst({
                    where: { calibre: lease.gun.calibre },
                });
                if (ammo) {
                    await tx.ammunition.update({
                        where: { id: ammo.id },
                        data: {
                            availableQuantity: ammo.availableQuantity + lease.bulletsIssued,
                        },
                    });
                    await tx.ammunitionTransaction.create({
                        data: {
                            ammunitionId: ammo.id,
                            type: 'Manual Adjustment',
                            quantity: lease.bulletsIssued,
                            reference: `CANCEL-LSE-${lease.id}`,
                            performedBy: officer,
                            userId: userId || null,
                            notes: `Restocked due to cancellation of lease #${lease.id}`,
                        },
                    });
                }
            }
            return updated;
        });
        await logAudit({
            req,
            action: 'CANCEL_LEASE',
            entityType: 'Lease',
            entityId: lease.id,
            newValue: { status: 'Cancelled' },
        });
        return result;
    }
}
