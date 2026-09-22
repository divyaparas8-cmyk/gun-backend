import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app.js';
import { startOverdueCron } from './cron/overdueCron.js';
import { prisma } from './config/prisma.js';

const PORT = process.env.PORT || 5000;
const app = createApp();

const startServer = async () => {
  try {
    // Verify database connection
    await prisma.$connect();
    console.log('[DATABASE] MySQL (armory_db) connected successfully via Prisma.');

    // Auto-seed initial dataset if database is empty/fresh
    try {
      const userCount = await prisma.user.count();
      const gunCount = await prisma.gun.count();
      if (userCount === 0 || gunCount === 0) {
        console.log('[AUTO-INIT] Database has 0 records. Auto-populating Kuwait MOI armory data...');
        const { populateComprehensiveData } = await import('./seed/populateData.js');
        await populateComprehensiveData();
      }
    } catch (e: any) {
      console.warn('[AUTO-INIT WARNING] Could not auto-check DB records:', e.message);
    }

    // Start background overdue cron scheduler
    startOverdueCron();

    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`🛡️  ARMORY MANAGEMENT SYSTEM BACKEND RUNNING`);
      console.log(`🚀 Port: http://localhost:${PORT}`);
      console.log(`🌐 Health: http://localhost:${PORT}/health`);
      console.log(`📡 API Base: http://localhost:${PORT}/api`);
      console.log(`=======================================================`);
    });
  } catch (error) {
    console.error('[SERVER ERROR] Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
