const mysql = require('mysql');

process.env.MYSQL_HOST = '';
const port = Number(process.env.MYSQL_PORT) || 33306;
const database = process.env.MYSQL_DATABASE || 'test_db';
const host = process.env.MYSQL_HOST || '127.0.0.1';
const user = process.env.MYSQL_USER || 'otel';
const password = process.env.MYSQL_PASSWORD || 'secret';

const connection = mysql.createConnection({
  port,
  user,
  host,
  password,
  database,
});

const q = connection.query('select 1+2')

q.on('result', console.log);
q.on('end', console.log);
q.on('error', console.log);
