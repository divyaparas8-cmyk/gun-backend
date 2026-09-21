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
    }
    catch (error) {
        console.error('[SERVER ERROR] Failed to start server:', error);
        process.exit(1);
    }
};
startServer();
