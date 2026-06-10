const { Pool } = require('pg');

// Substitua pela sua string de conexão com a sua senha real
const connectionString = 'postgresql://postgres.bcrkpghlsvhrbbnjwexo: 1IFufdLaqOtpGEyI@aws-1-sa-east-1.pooler.supabase.com:6543/postgres';

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false // Obrigatório para conexões seguras na nuvem (Supabase/Render)
    }
});

module.exports = pool;