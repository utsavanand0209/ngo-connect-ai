const { Pool } = require('pg');

let pool;

const DEFAULT_POSTGRES_URL = 'postgresql://ngo_connect_app:ngo_connect_app_pw_2026@localhost:5432/ngo_connect';

const quoteIdentifier = (identifier) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return identifier;
};

const connectDB = async (uri) => {
  if (pool) return pool;

  const connectionString =
    uri ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URI ||
    DEFAULT_POSTGRES_URL;

  pool = new Pool({ connectionString });

  try {
    await pool.query('SELECT 1');
    console.log('PostgreSQL connected');
    return pool;
  } catch (error) {
    console.error('PostgreSQL connection error', error);
    process.exit(1);
  }
};

const getPool = () => {
  if (!pool) {
    throw new Error('PostgreSQL pool is not initialized. Call connectDB first.');
  }
  return pool;
};

const query = async (text, params = []) => {
  if (!pool) {
    await connectDB();
  }
  return pool.query(text, params);
};

const close = async () => {
  if (!pool) return;
  await pool.end();
  pool = null;
};

module.exports = {
  connectDB,
  getPool,
  query,
  close,
  quoteIdentifier
};
