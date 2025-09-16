
const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres', // înlocuiește cu userul tău
  host: 'localhost',
  database: 'Licenta', // înlocuiește cu numele bazei tale
  password: 'lorenaariana123', // înlocuiește cu parola ta
  port: 5432,
});

module.exports = pool;
