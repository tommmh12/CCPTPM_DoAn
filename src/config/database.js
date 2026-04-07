const mysql = require("mysql2/promise");

const { env } = require("./env");

const pool = mysql.createPool({
  host: env.dbHost,
  port: env.dbPort,
  database: env.dbName,
  user: env.dbUser,
  password: env.dbPassword,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: false,
});
//
module.exports = { pool };
