const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.bcrkpghlsvhrbbnjwexo:1IFufdLaqOtpGEyI@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require';

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false // Obrigatório para o Supabase/Render
    }
});

module.exports = pool;