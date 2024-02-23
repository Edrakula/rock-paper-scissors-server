const mysql = require('mysql');

// Create a MySQL connection
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '', // Leave it empty if you haven't set a password
  database: 'nodetest',
});

// Connect to the MySQL server
connection.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL server');
});

// Define the SQL query to create a table
const createTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        UNIQUE KEY id_unique (id)
    );

`;

// Execute the query to create the table
connection.query(createTableQuery, (err, results) => {
  if (err) throw err;
  console.log('Table created or already exists');
});

// Close the MySQL connection
connection.end((err) => {
  if (err) {
    console.error('Error closing MySQL connection:', err);
  }
  console.log('MySQL connection closed');
});
