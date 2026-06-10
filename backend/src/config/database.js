const { Pool } = require('pg');

// Substitua pela sua string de conexão com a sua senha real
const connectionString = 'postgresql://postgres:1IFufdLaqOtpGEyI@db.bcrkpghlsvhrbbnjwexo.supabase.co:5432/postgres';

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false // Obrigatório para conexões seguras na nuvem (Supabase/Render)
    }
});

module.exports = pool;