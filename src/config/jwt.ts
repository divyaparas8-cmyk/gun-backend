import dotenv from 'dotenv';
dotenv.config();

export const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_armory_jwt_key_2026_moi_kuwait_secure';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
