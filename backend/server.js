const express = require('express');
const cors = require('cors');
const pool = require('./src/config/database');
const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static('../frontend'));

// =======================================================================
// FUNCIONALIDADE 1: Autenticação de Usuários (Apenas Administrador)
// =======================================================================
app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: "Campos obrigatórios." });

    try {
        // Busca estritamente na tabela de administradores
        const result = await pool.query(
            'SELECT id_admin, nome FROM admin WHERE email = $1 AND senha = $2', 
            [email, senha]
        );
        
        if (result.rows.length > 0) {
            return res.json({ 
                sucesso: true, 
                mensagem: "Autenticado com sucesso como Administrador!", 
                usuario: result.rows[0],
                role: 'admin' // Garante o nível total de acesso no front
            });
        }
        return res.status(401).json({ erro: "Acesso negado: Credenciais de Administrador incorretas." });
    } catch (err) {
        return res.status(500).json({ erro: "Erro interno no servidor de login." });
    }
});
// =======================================================================
// FUNCIONALIDADE EXTRA: Cadastro de Turmas
// =======================================================================
app.post('/api/turmas', async (req, res) => {
    const { id_turma, nome, id_curso, id_periodo } = req.body;
    if (!id_turma || !nome || !id_curso || !id_periodo) {
        return res.status(400).json({ erro: "Todos os campos são obrigatórios." });
    }
    try {
        await pool.query(
            'INSERT INTO turma (id_turma, nome, id_curso, id_periodo) VALUES ($1::int, $2, $3::int, $4::int)',
            [parseInt(id_turma), nome, parseInt(id_curso), parseInt(id_periodo)]
        );
        return res.status(201).json({ sucesso: true, mensagem: "Turma cadastrada com sucesso!" });
    } catch (err) {
        return res.status(500).json({ erro: "Erro ao cadastrar turma no banco.", detalhe: err.message });
    }
});

// =======================================================================
// AUXILIAR: Rotas para carregar as opções dos SELECTS dinamicamente
// =======================================================================
app.get('/api/opcoes-selects', async (req, res) => {
    try {
        const professores = await pool.query('SELECT id_professor, nome FROM professor ORDER BY nome');
        const disciplinas = await pool.query('SELECT id_disciplina, nome FROM disciplina ORDER BY nome');
        const turmas = await pool.query('SELECT id_turma, nome FROM turma ORDER BY nome');
        const salas = await pool.query('SELECT id_sala, numero FROM sala ORDER BY numero');
        const horarios = await pool.query("SELECT id_horario, CONCAT(dia, ' - ', turno) as descricao FROM horario ORDER BY id_horario");

        return res.json({
            professores: professores.rows,
            disciplinas: disciplinas.rows,
            turmas: turmas.rows,
            salas: salas.rows,
            horarios: horarios.rows
        });
    } catch (err) {
        return res.status(500).json({ erro: "Erro ao carregar opções para os seletores." });
    }
});

// =======================================================================
// FUNCIONALIDADE 2: Cadastro de Professores (Restrito para Admin no Front)
// =======================================================================
app.post('/api/professores', async (req, res) => {
    const { id_professor, nome, email, senha } = req.body;
    if (!id_professor || !nome || !email || !senha) return res.status(400).json({ erro: "Todos os campos são obrigatórios." });

    try {
        const checkEmail = await pool.query('SELECT id_professor FROM professor WHERE email = $1', [email]);
        if (checkEmail.rows.length > 0) return res.status(400).json({ erro: "E-mail já cadastrado." });

        await pool.query('INSERT INTO professor (id_professor, nome, email, senha) VALUES ($1, $2, $3, $4)', [id_professor, nome, email, senha]);
        return res.status(201).json({ sucesso: true, mensagem: "Professor cadastrado com sucesso!" });
    } catch (err) {
        return res.status(500).json({ erro: "Erro ao cadastrar professor." });
    }
});

// =======================================================================
// FUNCIONALIDADE 3: Cadastro de Disciplinas
// =======================================================================
app.post('/api/disciplinas', async (req, res) => {
    const { id_disciplina, nome, carga_horaria, id_periodo } = req.body;
    if (!id_disciplina || !nome || !carga_horaria || !id_periodo) {
        return res.status(400).json({ erro: "Todos os campos são obrigatórios." });
    }

    try {
        // Insere a nova disciplina com nome e carga horária na tabela pai correspondente
        await pool.query(
            'INSERT INTO disciplina (id_disciplina, nome, carga_horaria, id_periodo) VALUES ($1::int, $2, $3::int, $4::int)',
            [parseInt(id_disciplina), nome, parseInt(carga_horaria), parseInt(id_periodo)]
        );
        return res.status(201).json({ sucesso: true, mensagem: "Disciplina cadastrada com sucesso!" });
    } catch (err) {
        return res.status(500).json({ erro: "Erro ao cadastrar disciplina no banco.", detalhe: err.message });
    }
});

// =======================================================================
// FUNCIONALIDADE 4: Alocação de Grade Horária (Restrito para Admin no Front)
// =======================================================================
app.post('/api/alocacoes', async (req, res) => {
    const { id_turma, id_disciplina, id_professor, id_horario, id_sala } = req.body;

    try {
        // 1. Verificações de Choque de Horário (Anti-Choque)
        const choqueProf = await pool.query('SELECT id_turma_disciplina FROM turma_disciplina WHERE id_professor = $1 AND id_horario = $2', [id_professor, id_horario]);
        if (choqueProf.rows.length > 0) return res.status(409).json({ erro: "Conflito: Professor já ocupado neste horário." });

        const choqueSala = await pool.query('SELECT id_turma_disciplina FROM turma_disciplina WHERE id_sala = $1 AND id_horario = $2', [id_sala, id_horario]);
        if (choqueSala.rows.length > 0) return res.status(409).json({ erro: "Conflito: Sala já ocupada neste horário." });

        const choqueTurma = await pool.query('SELECT id_turma_disciplina FROM turma_disciplina WHERE id_turma = $1 AND id_horario = $2', [id_turma, id_horario]);
        if (choqueTurma.rows.length > 0) return res.status(409).json({ erro: "Conflito: Turma já tem aula neste horário." });

        // 2. SOLUÇÃO DO ERRO: Geramos um ID numérico aleatório para a Chave Primária não ir nula
        const pkFinal = Math.floor(Math.random() * 2147483647); // Gera um ID válido dentro do limite do tipo INT do Postgres

        // 3. Executa o INSERT passando explicitamente o id_turma_disciplina
        await pool.query(
            'INSERT INTO turma_disciplina (id_turma_disciplina, id_turma, id_disciplina, id_professor, id_horario, id_sala) VALUES ($1::int, $2::int, $3::int, $4::int, $5::int, $6::int)',
            [pkFinal, parseInt(id_turma), parseInt(id_disciplina), parseInt(id_professor), parseInt(id_horario), parseInt(id_sala)]
        );

        return res.status(201).json({ sucesso: true, mensagem: "Grade horária salva com sucesso!" });
    } catch (error) {
        return res.status(500).json({ erro: "Erro interno no banco de dados.", detalhe: error.message });
    }
});

// =======================================================================
// FUNCIONALIDADE EXTRA: Alteração de Alocação de Horário (UPDATE)
// =======================================================================
app.put('/api/alocacoes/:id', async (req, res) => {
    const id_alocacao = parseInt(req.params.id);
    const { id_turma, id_disciplina, id_professor, id_horario, id_sala } = req.body;

    try {
        // Validação anti-choque (ignorando a própria alocação que está sendo alterada)
        const choqueProf = await pool.query('SELECT id_turma_disciplina FROM turma_disciplina WHERE id_professor = $1 AND id_horario = $2 AND id_turma_disciplina <> $3', [id_professor, id_horario, id_alocacao]);
        if (choqueProf.rows.length > 0) return res.status(409).json({ erro: "Conflito: Professor já ocupado neste horário." });

        const choqueSala = await pool.query('SELECT id_turma_disciplina FROM turma_disciplina WHERE id_sala = $1 AND id_horario = $2 AND id_turma_disciplina <> $3', [id_sala, id_horario, id_alocacao]);
        if (choqueSala.rows.length > 0) return res.status(409).json({ erro: "Conflito: Sala já ocupada neste horário." });

        const choqueTurma = await pool.query('SELECT id_turma_disciplina FROM turma_disciplina WHERE id_turma = $1 AND id_horario = $2 AND id_turma_disciplina <> $3', [id_turma, id_horario, id_alocacao]);
        if (choqueTurma.rows.length > 0) return res.status(409).json({ erro: "Conflito: Turma já tem aula neste horário." });

        // Executa a atualização
        await pool.query(
            'UPDATE turma_disciplina SET id_turma = $1::int, id_disciplina = $2::int, id_professor = $3::int, id_horario = $4::int, id_sala = $5::int WHERE id_turma_disciplina = $6::int',
            [parseInt(id_turma), parseInt(id_disciplina), parseInt(id_professor), parseInt(id_horario), parseInt(id_sala), id_alocacao]
        );

        return res.json({ sucesso: true, mensagem: "Alocação de horário alterada com sucesso!" });
    } catch (error) {
        return res.status(500).json({ erro: "Erro ao alterar horário no banco.", detalhe: error.message });
    }
});

// =======================================================================
// FUNCIONALIDADE EXTRA: Exclusão de Alocação de Horário (DELETE)
// =======================================================================
app.delete('/api/alocacoes/:id', async (req, res) => {
    const id_alocacao = parseInt(req.params.id);

    try {
        const resultado = await pool.query('DELETE FROM turma_disciplina WHERE id_turma_disciplina = $1::int', [id_alocacao]);
        
        if (resultado.rowCount === 0) {
            return res.status(404).json({ erro: "Nenhuma alocação encontrada com este ID." });
        }

        return res.json({ sucesso: true, mensagem: "Alocação excluída da grade com sucesso!" });
    } catch (error) {
        return res.status(500).json({ erro: "Erro ao deletar horário no banco.", detalhe: error.message });
    }
});

// =======================================================================
// MAPEAMENTO INTEGRAL DAS 12 CONSULTAS SQL (Parte 2)
// =======================================================================
app.get('/api/consultas/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    let querySQL = '';

    switch (id) {
        // --- 1. OPERAÇÕES DE JUNÇÃO (2 consultas) ---
        case 1: // 1.1 Relatório Completo de Alocação (Agora com ID Único na frente)
            querySQL = `SELECT td.id_turma_disciplina AS id_alocacao, t.nome AS turma, d.nome AS disciplina, p.nome AS professor, h.dia, s.numero AS sala, b.nome_bloco FROM turma_disciplina td INNER JOIN turma t ON td.id_turma = t.id_turma INNER JOIN disciplina d ON td.id_disciplina = d.id_disciplina INNER JOIN professor p ON td.id_professor = p.id_professor INNER JOIN horario h ON td.id_horario = h.id_horario INNER JOIN sala s ON td.id_sala = s.id_sala INNER JOIN bloco b ON s.id_bloco = b.id_bloco;`;
            break;
        case 2: // 1.2 Localização Física por Curso
            querySQL = `SELECT c.nome AS curso, t.nome AS turma, d.nome AS disciplina, s.numero AS sala FROM turma_disciplina td INNER JOIN turma t ON td.id_turma = t.id_turma INNER JOIN curso c ON t.id_curso = c.id_curso INNER JOIN disciplina d ON td.id_disciplina = d.id_disciplina INNER JOIN sala s ON td.id_sala = s.id_sala;`;
            break;

        // --- 2. OPERAÇÕES DE CONJUNTOS (3 consultas) ---
        case 3: // 2.1 União (UNION) - Contatos Gerais
            querySQL = `SELECT a.nome, a.email, 'Admin' AS tipo FROM admin a CROSS JOIN curso c CROSS JOIN periodo pe UNION SELECT p.nome, p.email, 'Professor' AS tipo FROM professor p INNER JOIN turma_disciplina td ON p.id_professor = td.id_professor INNER JOIN turma t ON td.id_turma = t.id_turma;`;
            break;
        case 4: // 2.2 Interseção (INTERSECT) - Profs Segunda AND Terça
            querySQL = `SELECT p.id_professor, p.nome FROM professor p INNER JOIN turma_disciplina td ON p.id_professor = td.id_professor INNER JOIN horario h ON td.id_horario = h.id_horario WHERE h.dia = 'Segunda-feira' INTERSECT SELECT p.id_professor, p.nome FROM professor p INNER JOIN turma_disciplina td ON p.id_professor = td.id_professor INNER JOIN horario h ON td.id_horario = h.id_horario WHERE h.dia = 'Terça-feira';`;
            break;
        case 5: // 2.3 Diferença (EXCEPT) - Períodos com turmas sem disciplinas alocadas
            querySQL = `SELECT pe.id_periodo, pe.nome_periodo FROM periodo pe INNER JOIN turma t ON pe.id_periodo = t.id_periodo INNER JOIN curso c ON t.id_curso = c.id_curso EXCEPT SELECT pe.id_periodo, pe.nome_periodo FROM periodo pe INNER JOIN disciplina d ON pe.id_periodo = d.id_periodo INNER JOIN turma_disciplina td ON d.id_disciplina = td.id_disciplina;`;
            break;

        // --- 3. OPERAÇÕES DE AGREGAÇÃO (4 consultas) ---
        case 6: // 3.1 COUNT - Total disciplinas por Curso
            querySQL = `SELECT c.nome AS curso, COUNT(td.id_disciplina) AS total FROM curso c INNER JOIN turma t ON c.id_curso = t.id_curso INNER JOIN turma_disciplina td ON t.id_turma = td.id_turma GROUP BY c.nome;`;
            break;
        case 7: // 3.2 MAX, MIN, AVG - Capacidades por Bloco
            querySQL = `SELECT b.nome_bloco, MAX(s.capacidade) AS max, MIN(s.capacidade) AS min, AVG(s.capacidade)::numeric(10,2) AS media FROM bloco b INNER JOIN sala s ON b.id_bloco = s.id_bloco INNER JOIN turma_disciplina td ON s.id_sala = td.id_sala GROUP BY b.nome_bloco;`;
            break;
        case 8: // 3.3 SUM, COUNT + GROUP BY + HAVING - Carga horária acumulada
            querySQL = `SELECT p.nome AS professor, SUM(d.carga_horaria) AS carga_total FROM professor p INNER JOIN turma_disciplina td ON p.id_professor = td.id_professor INNER JOIN disciplina d ON td.id_disciplina = d.id_disciplina GROUP BY p.nome HAVING SUM(d.carga_horaria) > 50;`;
            break;
        case 9: // 3.4 COUNT + GROUP BY + HAVING - Salas muito movimentadas
            querySQL = `SELECT b.nome_bloco, s.numero, COUNT(td.id_turma_disciplina) AS total FROM bloco b INNER JOIN sala s ON b.id_bloco = s.id_bloco INNER JOIN turma_disciplina td ON s.id_sala = td.id_sala GROUP BY b.nome_bloco, s.numero HAVING COUNT(td.id_turma_disciplina) >= 1;`;
            break;

        // --- 4. OPERADORES ESPECIAIS (3 consultas) ---
        case 10: // 4.1 LIKE - Filtro disciplina "Dados"
            querySQL = `SELECT d.nome AS disciplina, p.nome AS professor, t.nome AS turma FROM turma_disciplina td INNER JOIN disciplina d ON td.id_disciplina = d.id_disciplina INNER JOIN professor p ON td.id_professor = p.id_professor INNER JOIN turma t ON td.id_turma = t.id_turma WHERE d.nome LIKE '%Dados%';`;
            break;
        case 11: // 4.2 BETWEEN - Salas capacidade entre 30 e 50
            querySQL = `SELECT s.numero, s.capacidade, t.nome AS turma FROM turma_disciplina td INNER JOIN sala s ON td.id_sala = s.id_sala INNER JOIN turma t ON td.id_turma = t.id_turma WHERE s.capacidade BETWEEN 30 AND 50;`;
            break;
        case 12: // 4.3 IN - Turnos Específicos
            querySQL = `SELECT t.nome AS turma, d.nome AS disciplina, h.turno FROM turma_disciplina td INNER JOIN turma t ON td.id_turma = t.id_turma INNER JOIN disciplina d ON td.id_disciplina = d.id_disciplina INNER JOIN horario h ON td.id_horario = h.id_horario WHERE h.turno IN ('Primeiro Horário', 'Segundo Horário');`;
            break;

        // --- 5. VISÕES / VIEWS (2 extras disparadas sob demanda) ---
        case 13: // 5.1 View Grade Professores
            querySQL = `SELECT * FROM vw_grade_professores;`;
            break;
        case 14: // 5.2 View Ocupação Predial
            querySQL = `SELECT * FROM vw_ocupacao_predial;`;
            break;

        default:
            return res.status(400).json({ erro: "ID de consulta inválido." });
    }

    try {
        const resultado = await pool.query(querySQL);
        return res.json(resultado.rows);
    } catch (error) {
        console.error("====== ERRO REAL DO POSTGRESQL ======");
        console.error(error.message);
        console.error("=====================================");
        
        // Alterado para enviar o "error.message" direto para a tela do navegador
        return res.status(500).json({ 
            erro: `Erro no Banco: ${error.message}` 
        });
    }
});

const porta = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando e blindado na porta ${porta}`));