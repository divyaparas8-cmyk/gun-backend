import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { logAudit } from '../services/auditService.js';

export class UserController {
  static async listUsers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          employeeId: true,
          role: true,
          department: true,
          status: true,
          lastLogin: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      res.status(200).json({
        success: true,
        data: users,
      });
    } catch (error) {
      next(error);
    }
  }

  static async createUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { name, email, employeeId, password, role, department } = req.body;

      if (!name || !email || !employeeId || !password || !role) {
        throw new AppError('Name, email, employeeId, password, and role are required.', 400, 'MISSING_FIELDS');
      }

      const existing = await prisma.user.findFirst({
        where: { OR: [{ email: email.toLowerCase() }, { employeeId: employeeId.toUpperCase() }] },
      });
      if (existing) {
        throw new AppError('A user with this email or employee ID already exists.', 400, 'DUPLICATE_USER');
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          name,
          email: email.toLowerCase(),
          employeeId: employeeId.toUpperCase(),
          passwordHash,
          role,
          department: department || 'General Armory Staff',
          status: 'Active',
        },
        select: {
          id: true,
          name: true,
          email: true,
          employeeId: true,
          role: true,
          department: true,
          status: true,
          createdAt: true,
        },
      });

      await logAudit({
        req,
        action: 'CREATE_USER',
        entityType: 'User',
        entityId: user.id,
        newValue: { name: user.name, email: user.email, role: user.role },
      });

      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const { name, email, role, department, status, password } = req.body;

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email.toLowerCase();
      if (role) updateData.role = role;
      if (department) updateData.department = department;
      if (status) updateData.status = status;
      if (password && password.trim() !== '') {
        updateData.passwordHash = await bcrypt.hash(password, 10);
      }

      const updated = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          employeeId: true,
          role: true,
          department: true,
          status: true,
          updatedAt: true,
        },
      });

      await logAudit({
        req,
        action: 'UPDATE_USER',
        entityType: 'User',
        entityId: id,
        oldValue: { name: existing.name, role: existing.role, status: existing.status },
        newValue: updateData,
      });

      res.status(200).json({
        success: true,
        message: 'User updated successfully',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
}
