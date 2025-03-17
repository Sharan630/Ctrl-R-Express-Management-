import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function connectDB() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASS || 'Ramcharan@1104',
            database: process.env.DB_NAME || 'bus'
        });

        console.log(' Connected to MySQL Workbench');
        return connection;
    } catch (error) {
        console.error(' Database connection failed:', error);
        process.exit(1);
    }
}

const connection = await connectDB();
export default connection;