const pool = require('../db');

// Salvează o diagramă nouă sau actualizează una existentă
exports.saveDiagram = async (req, res) => {
  const { userId, title, tipDiagrama, nodes, edges, diagramId } = req.body;

  try {
    // Verifică dacă tipul de diagramă există, dacă nu îl creează
    let tipResult = await pool.query(
      'SELECT id_tip FROM tipuri_diagrame WHERE nume_tip = $1',
      [tipDiagrama]
    );

    let idTip;
    if (tipResult.rows.length === 0) {
      const insertTip = await pool.query(
        'INSERT INTO tipuri_diagrame (nume_tip) VALUES ($1) RETURNING id_tip',
        [tipDiagrama]
      );
      idTip = insertTip.rows[0].id_tip;
    } else {
      idTip = tipResult.rows[0].id_tip;
    }

    // Verifică dacă există componenta "Nod" pentru acest tip
    let componentaResult = await pool.query(
      'SELECT id_componenta FROM componente_diagrame WHERE id_tip = $1 AND nume_componenta = $2',
      [idTip, 'Nod']
    );

    let idComponentaNod;
    if (componentaResult.rows.length === 0) {
      const insertComp = await pool.query(
        'INSERT INTO componente_diagrame (id_tip, nume_componenta, specificatii) VALUES ($1, $2, $3) RETURNING id_componenta',
        [idTip, 'Nod', JSON.stringify({ radius: 28 })]
      );
      idComponentaNod = insertComp.rows[0].id_componenta;
    } else {
      idComponentaNod = componentaResult.rows[0].id_componenta;
    }

    // Verifică dacă există legătura "Muchie" pentru acest tip
    let legaturaResult = await pool.query(
      'SELECT id_legatura FROM legaturi_diagrame WHERE id_tip = $1 AND nume_legatura = $2',
      [idTip, 'Muchie']
    );

    let idLegaturaMuchie;
    if (legaturaResult.rows.length === 0) {
      const insertLeg = await pool.query(
        'INSERT INTO legaturi_diagrame (id_tip, nume_legatura, specificatii) VALUES ($1, $2, $3) RETURNING id_legatura',
        [idTip, 'Muchie', JSON.stringify({ directed: tipDiagrama === 'Graf orientat' })]
      );
      idLegaturaMuchie = insertLeg.rows[0].id_legatura;
    } else {
      idLegaturaMuchie = legaturaResult.rows[0].id_legatura;
    }

    let idDiagrama;

    if (diagramId) {
      // Actualizează diagrama existentă
      await pool.query(
        'UPDATE diagrame SET titlu = $1, data_update = CURRENT_TIMESTAMP WHERE id_diagrama = $2',
        [title, diagramId]
      );
      idDiagrama = diagramId;

      // Șterge componentele și legăturile existente
      await pool.query('DELETE FROM componente_existente WHERE id_diagrama = $1', [idDiagrama]);
    } else {
      // Creează o diagramă nouă
      const diagramResult = await pool.query(
        'INSERT INTO diagrame (id_user, titlu, id_tip) VALUES ($1, $2, $3) RETURNING id_diagrama',
        [userId, title, idTip]
      );
      idDiagrama = diagramResult.rows[0].id_diagrama;
    }

    // Salvează nodurile și păstrează maparea id local -> id_instanta din DB
    const nodeIdMap = {};
    for (const node of nodes) {
      const nodeResult = await pool.query(
        `INSERT INTO componente_existente 
         (id_diagrama, id_componenta, continut, x, y, weight, height) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING id_instanta`,
        [
          idDiagrama,
          idComponentaNod,
          JSON.stringify({ label: node.label, originalId: node.id }),
          Math.round(node.x),
          Math.round(node.y),
          56,
          56
        ]
      );
      nodeIdMap[node.id] = nodeResult.rows[0].id_instanta;
    }

    // Salvează muchiile
    for (const edge of edges) {
      const idStart = nodeIdMap[edge.from];
      const idEnd = nodeIdMap[edge.to];

      if (idStart && idEnd) {
        await pool.query(
          `INSERT INTO legaturi_existente 
           (id_diagrama, id_legatura, id_start, id_end, text, puncte_intermediare) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            idDiagrama,
            idLegaturaMuchie,
            idStart,
            idEnd,
            JSON.stringify({}),
            JSON.stringify([])
          ]
        );
      }
    }

    return res.status(200).json({
      message: 'Diagrama a fost salvată cu succes!',
      diagramId: idDiagrama
    });

  } catch (err) {
    console.error('Eroare la salvarea diagramei:', err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};

// Obține toate diagramele unui utilizator
exports.getUserDiagrams = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `SELECT d.id_diagrama, d.titlu, d.data_create, d.data_update, t.nume_tip 
       FROM diagrame d 
       JOIN tipuri_diagrame t ON d.id_tip = t.id_tip 
       WHERE d.id_user = $1 
       ORDER BY d.data_update DESC`,
      [userId]
    );

    return res.status(200).json({ diagrams: result.rows });
  } catch (err) {
    console.error('Eroare la obținerea diagramelor:', err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};

// Încarcă o diagramă specifică
exports.loadDiagram = async (req, res) => {
  const { diagramId } = req.params;

  try {
    // Obține informațiile despre diagramă
    const diagramResult = await pool.query(
      `SELECT d.*, t.nume_tip FROM diagrame d 
       JOIN tipuri_diagrame t ON d.id_tip = t.id_tip 
       WHERE d.id_diagrama = $1`,
      [diagramId]
    );

    if (diagramResult.rows.length === 0) {
      return res.status(404).json({ message: 'Diagrama nu a fost găsită' });
    }

    const diagram = diagramResult.rows[0];

    // Obține nodurile
    const nodesResult = await pool.query(
      `SELECT id_instanta, continut, x, y FROM componente_existente 
       WHERE id_diagrama = $1`,
      [diagramId]
    );

    const nodes = nodesResult.rows.map(row => ({
      id: row.continut.originalId || row.continut.label || `node_${row.id_instanta}`,
      label: row.continut.label || '',
      x: row.x,
      y: row.y,
      dbId: row.id_instanta
    }));

    // Creează maparea id_instanta -> id local
    const dbIdToLocalId = {};
    nodesResult.rows.forEach(row => {
      const localId = row.continut.originalId || row.continut.label || `node_${row.id_instanta}`;
      dbIdToLocalId[row.id_instanta] = localId;
    });

    // Obține muchiile
    const edgesResult = await pool.query(
      `SELECT id_start, id_end, text FROM legaturi_existente 
       WHERE id_diagrama = $1`,
      [diagramId]
    );

    const edges = edgesResult.rows.map(row => ({
      from: dbIdToLocalId[row.id_start],
      to: dbIdToLocalId[row.id_end]
    }));

    return res.status(200).json({
      diagram: {
        id: diagram.id_diagrama,
        title: diagram.titlu,
        type: diagram.nume_tip,
        createdAt: diagram.data_create,
        updatedAt: diagram.data_update
      },
      nodes,
      edges
    });

  } catch (err) {
    console.error('Eroare la încărcarea diagramei:', err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};

// Șterge o diagramă
exports.deleteDiagram = async (req, res) => {
  const { diagramId } = req.params;

  try {
    await pool.query('DELETE FROM diagrame WHERE id_diagrama = $1', [diagramId]);
    return res.status(200).json({ message: 'Diagrama a fost ștearsă' });
  } catch (err) {
    console.error('Eroare la ștergerea diagramei:', err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};
