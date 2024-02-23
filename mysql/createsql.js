const mysql = require('mysql');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
});

const databaseName = 'nodetest';
const createDatabaseQuery = `CREATE DATABASE IF NOT EXISTS ${databaseName}`;

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL server');

  connection.query(createDatabaseQuery, (err, results) => {
    if (err) throw err;
    console.log('Database created or already exists');

    connection.end((err) => {
      if (err) {
        console.error('Error closing MySQL connection:', err);
      }
      console.log('MySQL connection closed');
    });
  });
});
