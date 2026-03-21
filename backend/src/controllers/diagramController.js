const pool = require('../db');

// Salvează diagramă de automat (State Diagram) - inclusă în saveDiagram acum
exports.saveStateDiagram = async (req, res) => {
  // Redirect to saveDiagram
  exports.saveDiagram(req, res);
};

// Salvează o diagramă nouă sau actualizează una existentă (Grafuri + State Diagrams)
exports.saveDiagram = async (req, res) => {
  let { userId, title, tipDiagrama, nodes, edges, elements, connections, diagramData, diagramId } = req.body;

  try {
    if (!userId || !title) {
      return res.status(400).json({ message: 'Lipsa userId sau title!' });
    }

    // Extrage elements și connections din diagramData dacă sunt acolo (frontend state diagrams)
    if (diagramData) {
      if (diagramData.elements && !elements) elements = diagramData.elements;
      if (diagramData.connections && !connections) connections = diagramData.connections;
    }

    console.log('Save request:', {
      tipDiagrama,
      hasNodes: !!nodes,
      hasEdges: !!edges,
      hasElements: !!elements,
      hasConnections: !!connections,
      hasDiagramData: !!diagramData
    });

    // Verifică dacă tipul de diagramă există
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

    // Determină dacă e state diagram sau graph
    const isStateDiagram = tipDiagrama === 'Automat - Diagrama Stări' || elements || connections;
    
    // Folosește elements/connections dacă sunt disponibile, altfel nodes/edges
    const finalNodes = elements || nodes || [];
    const finalEdges = connections || edges || [];

    // Componentă: pentru state diagrams folosim "Stare", pentru grafuri folosim "Nod"
    const componentLabel = isStateDiagram ? 'Stare' : 'Nod';
    
    let componentaResult = await pool.query(
      'SELECT id_componenta FROM componente_diagrame WHERE id_tip = $1 AND nume_componenta = $2',
      [idTip, componentLabel]
    );

    let idComponenta;
    if (componentaResult.rows.length === 0) {
      const insertComp = await pool.query(
        'INSERT INTO componente_diagrame (id_tip, nume_componenta, specificatii) VALUES ($1, $2, $3) RETURNING id_componenta',
        [idTip, componentLabel, JSON.stringify({ radius: 28 })]
      );
      idComponenta = insertComp.rows[0].id_componenta;
    } else {
      idComponenta = componentaResult.rows[0].id_componenta;
    }

    // Legătură: pentru state diagrams folosim "Tranziție", pentru grafuri folosim "Muchie"
    const legaturaLabel = isStateDiagram ? 'Tranziție' : 'Muchie';
    
    let legaturaResult = await pool.query(
      'SELECT id_legatura FROM legaturi_diagrame WHERE id_tip = $1 AND nume_legatura = $2',
      [idTip, legaturaLabel]
    );

    let idLegatura;
    if (legaturaResult.rows.length === 0) {
      const insertLeg = await pool.query(
        'INSERT INTO legaturi_diagrame (id_tip, nume_legatura, specificatii) VALUES ($1, $2, $3) RETURNING id_legatura',
        [idTip, legaturaLabel, JSON.stringify({ directed: isStateDiagram || tipDiagrama === 'Graf orientat' })]
      );
      idLegatura = insertLeg.rows[0].id_legatura;
    } else {
      idLegatura = legaturaResult.rows[0].id_legatura;
    }

    let idDiagrama;

    if (diagramId) {
      // Actualizează diagrama existentă
      await pool.query(
        'UPDATE diagrame SET titlu = $1, data_update = CURRENT_TIMESTAMP WHERE id_diagrama = $2',
        [title, diagramId]
      );
      idDiagrama = diagramId;

      // Șterge legăturile și componentele vechi
      await pool.query('DELETE FROM legaturi_existente WHERE id_diagrama = $1', [idDiagrama]);
      await pool.query('DELETE FROM componente_existente WHERE id_diagrama = $1', [idDiagrama]);
    } else {
      // Creează o diagramă nouă
      const diagramResult = await pool.query(
        'INSERT INTO diagrame (id_user, titlu, id_tip) VALUES ($1, $2, $3) RETURNING id_diagrama',
        [userId, title, idTip]
      );
      idDiagrama = diagramResult.rows[0].id_diagrama;
    }

    // Salvează componentele (noduri/stări)
    const nodeIdMap = {};
    
    if (finalNodes && Array.isArray(finalNodes)) {
      for (const node of finalNodes) {
        const nodeResult = await pool.query(
          `INSERT INTO componente_existente 
           (id_diagrama, id_componenta, continut, x, y, weight, height) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) 
           RETURNING id_instanta`,
          [
            idDiagrama,
            idComponenta,
            JSON.stringify({ 
              label: node.name || node.label || '',
              originalId: node.id,
              type: node.type || 'STATE'
            }),
            Math.round(node.x || 0),
            Math.round(node.y || 0),
            node.width || 100,
            node.height || 100
          ]
        );
        nodeIdMap[node.id] = nodeResult.rows[0].id_instanta;
      }
    }

    // Salvează legăturile (muchii/tranziții)
    if (finalEdges && Array.isArray(finalEdges)) {
      for (const edge of finalEdges) {
        const startId = edge.fromId || edge.from;
        const endId = edge.toId || edge.to;
        const idStart = nodeIdMap[startId];
        const idEnd = nodeIdMap[endId];

        if (idStart && idEnd) {
          const labelValue = (edge.label && edge.label.trim() !== '') ? edge.label.trim() : 'ε';
          
          // Save complete edge data including loopDirection
          const textData = { label: labelValue };
          if (edge.loopDirection) {
            textData.loopDirection = edge.loopDirection;
          }
          
          console.log(`Saving edge ${startId}->${endId}: label="${labelValue}", loopDirection="${edge.loopDirection || 'undefined'}"`);
          
          await pool.query(
            `INSERT INTO legaturi_existente 
             (id_diagrama, id_legatura, id_start, id_end, text, puncte_intermediare) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              idDiagrama,
              idLegatura,
              idStart,
              idEnd,
              JSON.stringify(textData),
              JSON.stringify([])
            ]
          );
        }
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

    // Obține componentele (nodurile/stările)
    const componentsResult = await pool.query(
      `SELECT ce.id_instanta, ce.continut, ce.x, ce.y, ce.weight, ce.height
       FROM componente_existente ce
       WHERE ce.id_diagrama = $1
       ORDER BY ce.id_instanta ASC`,
      [diagramId]
    );

    // Obține legăturile (muchiile/tranziții)
    const connectionsResult = await pool.query(
      `SELECT le.id_instanta, le.id_start, le.id_end, le.text
       FROM legaturi_existente le
       WHERE le.id_diagrama = $1
       ORDER BY le.id_instanta ASC`,
      [diagramId]
    );

    // Mapare: id_instanta din DB -> node object
    const nodeMap = {};
    const elements = [];

    for (const component of componentsResult.rows) {
      const continut = typeof component.continut === 'string' ? JSON.parse(component.continut) : component.continut;
      const element = {
        id: continut.originalId || `node-${component.id_instanta}`,
        name: continut.label || '',
        type: continut.type || 'STATE',
        x: component.x,
        y: component.y,
        width: component.weight,
        height: component.height,
        db_id: component.id_instanta
      };
      nodeMap[component.id_instanta] = element;
      elements.push(element);
    }

    // Construiește connections din legaturi_existente
    const connections = [];
    for (const connection of connectionsResult.rows) {
      const text = typeof connection.text === 'string' ? JSON.parse(connection.text) : connection.text;
      const startNode = nodeMap[connection.id_start];
      const endNode = nodeMap[connection.id_end];

      if (startNode && endNode) {
        const connData = {
          id: `conn-${connection.id_instanta}`,
          fromId: startNode.id,
          toId: endNode.id,
          label: text.label || 'ε',
          type: 'TRANSITION'
        };
        
        // Restore loopDirection if it was saved
        if (text.loopDirection) {
          connData.loopDirection = text.loopDirection;
        }
        
        connections.push(connData);
      }
    }

    // Returnează în formatul așteptat de frontend
    return res.status(200).json({
      diagram: {
        id: diagram.id_diagrama,
        title: diagram.titlu,
        type: diagram.nume_tip,
        createdAt: diagram.data_create,
        updatedAt: diagram.data_update
      },
      elements: elements,
      connections: connections
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
