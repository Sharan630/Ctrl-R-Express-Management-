import mysql from 'mysql2/promise';

// Create a connection to MySQL Workbench
const connection = await mysql.createConnection({
  host: 'localhost',      // Change if your MySQL Workbench runs on another host
  user: 'root',           // Replace with your MySQL username
  password: 'Ramcharan@1104',  // Replace with your MySQL password
  database: 'bus'  // The database you created in Workbench
});

console.log('Connected to MySQL Workbench');
export default connection;
