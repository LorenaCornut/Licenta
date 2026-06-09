const pool = require('../db');

// Salvează diagramă de automat sau state machine - inclusă în saveDiagram acum
exports.saveStateDiagram = async (req, res) => {
  // Redirect to saveDiagram
  exports.saveDiagram(req, res);
};

// Salvează o diagramă nouă sau actualizează una existentă (Grafuri + State Diagrams)
exports.saveDiagram = async (req, res) => {
  // NU MAI LUA userId DIN BODY
  let { title, tipDiagrama, nodes, edges, elements, connections, diagramData, diagramId } = req.body;
  const userId = req.user.id; // <-- ADAUGAT: ia din token

  try {
    // Normalize diagram type names
    if (tipDiagrama === 'STATE_MACHINE_DIAGRAM') {
      tipDiagrama = 'STATE_MACHINE_DIAGRAM';
    }

    if (tipDiagrama === 'Automat - Diagrama Stări') {
      tipDiagrama = 'AUTOMAT';
    }
    
    // VERIFICĂ DACĂ USERID EXISTĂ (acum vine din token)
    if (!userId || !title) {  // <-- SCHIMBAT: verifică doar title, userId vine sigur din middleware
      return res.status(400).json({ message: 'Lipsa titlu!' });
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
    const isStateDiagram = tipDiagrama === 'AUTOMAT' ||
      tipDiagrama === 'STATE_MACHINE_DIAGRAM' ||
      tipDiagrama === 'Automat - Diagrama Stări' ||
      elements || connections;
    
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
              type: node.type || 'STATE',
              stereotype: node.stereotype || '',
              color: node.color || '#60a5fa',
              entryAction: node.entryAction || '',
              exitAction: node.exitAction || ''
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
          const labelValue = (edge.label && edge.label.trim() !== '') ? edge.label.trim() : '';
          
          // Save complete edge data including loopDirection, type, points, and routing points
          const textData = { 
            label: labelValue,
            from: startId,  // Store original frontend IDs too
            to: endId,
            type: edge.type || 'TRANSITION'  // Store connection type
          };
          if (edge.loopDirection) {
            textData.loopDirection = edge.loopDirection;
          }
          // For UML diagrams, save edge/offset information (new format)
          if (edge.fromEdge) {
            textData.fromEdge = edge.fromEdge;
            textData.fromOffset = edge.fromOffset !== undefined ? edge.fromOffset : 0.5;
          }
          if (edge.toEdge) {
            textData.toEdge = edge.toEdge;
            textData.toOffset = edge.toOffset !== undefined ? edge.toOffset : 0.5;
          }
          // Also save connection point information (old format for backward compatibility)
          if (edge.fromPoint) {
            textData.fromPoint = edge.fromPoint;
          }
          if (edge.toPoint) {
            textData.toPoint = edge.toPoint;
          }
          
          // Salvează punctele de rută custom (controlPoints sau points)
          const routingPoints = edge.controlPoints || edge.points || [];
          
          console.log(`Saving edge ${startId}->${endId}: label="${labelValue}", routingPoints="${routingPoints.length}", frontendIds="${startId}-${endId}"`);
          
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
              JSON.stringify(routingPoints)
            ]
          );
        }
      }
    }

    console.log(`Diagram saved: ${idDiagrama}, nodes: ${finalNodes.length}, edges: ${finalEdges.length}`);
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
  const userId = req.user.id; // <-- SCHIMBAT: ia din token, nu din req.params

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
// Încarcă o diagramă specifică
exports.loadDiagram = async (req, res) => {
  const { diagramId } = req.params;
  const userId = req.user.id;

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
    
    // Verifică permisiuni
    if (diagram.id_user !== parseInt(userId)) {
      return res.status(403).json({ message: 'Nu aveți permisiunea să accesați această diagramă' });
    }

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
      `SELECT le.id_instanta, le.id_start, le.id_end, le.text, le.puncte_intermediare
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
      
      // Construiește elementul - păstrează toate proprietățile originale
      const element = {
        id: continut.originalId || `node-${component.id_instanta}`,
        name: continut.label || '',
        label: continut.label || '',
        type: continut.type || 'NODE',  // Pentru Deployment: NODE, ARTIFACT, etc.
        stereotype: continut.stereotype || '',
        color: continut.color || '#60a5fa',
        entryAction: continut.entryAction || '',
        exitAction: continut.exitAction || '',
        x: component.x,
        y: component.y,
        width: component.weight,
        height: component.height,
        db_id: component.id_instanta,
        // Adaugă și alte proprietăți specifice
        tokens: continut.tokens
      };
      nodeMap[component.id_instanta] = element;
      elements.push(element);
    }

    // Construiește connections din legaturi_existente
    const connections = [];
    for (const connection of connectionsResult.rows) {
      const text = typeof connection.text === 'string' ? JSON.parse(connection.text) : connection.text;
      const routingPoints = connection.puncte_intermediare 
        ? (typeof connection.puncte_intermediare === 'string' ? JSON.parse(connection.puncte_intermediare) : connection.puncte_intermediare)
        : [];
      
      const startNode = nodeMap[connection.id_start];
      const endNode = nodeMap[connection.id_end];

      if (startNode && endNode) {
        const connData = {
          id: `conn-${connection.id_instanta}`,
          fromId: startNode.id,
          toId: endNode.id,
          label: text.label || '',
          type: text.type || 'COMMUNICATION_PATH'
        };
        
        // Restore all routing information
        if (text.loopDirection) connData.loopDirection = text.loopDirection;
        if (text.fromPoint) connData.fromPoint = text.fromPoint;
        if (text.toPoint) connData.toPoint = text.toPoint;
        if (text.fromEdge) connData.fromEdge = text.fromEdge;
        if (text.fromOffset !== undefined) connData.fromOffset = text.fromOffset;
        if (text.toEdge) connData.toEdge = text.toEdge;
        if (text.toOffset !== undefined) connData.toOffset = text.toOffset;
        if (routingPoints && routingPoints.length > 0) connData.controlPoints = routingPoints;
        
        connections.push(connData);
      }
    }

    // Determină tipul diagramei
    const diagramType = diagram.nume_tip;
    const isGraphDiagram = diagramType === 'Graf orientat' || diagramType === 'Graf neorientat';
    const isStateDiagram = diagramType === 'AUTOMAT' || diagramType === 'STATE_MACHINE_DIAGRAM';
    const isDeploymentDiagram = diagramType === 'UML_DEPLOYMENT_DIAGRAM';
    
    // Pentru diagramele UML Deployment, returnează elements și connections
    if (isDeploymentDiagram || isStateDiagram) {
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
    } else if (isGraphDiagram) {
      // Pentru grafuri, convertește la nodes/edges
      const nodes = elements.map(el => ({
        id: el.id,
        label: el.name,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height
      }));
      
      const edges = connections.map(conn => ({
        from: conn.fromId,
        to: conn.toId,
        ...(conn.controlPoints && conn.controlPoints.length > 0 ? { controlPoints: conn.controlPoints } : {})
      }));
      
      return res.status(200).json({
        diagram: {
          id: diagram.id_diagrama,
          title: diagram.titlu,
          type: diagram.nume_tip,
          createdAt: diagram.data_create,
          updatedAt: diagram.data_update
        },
        nodes: nodes,
        edges: edges
      });
    } else {
      // Pentru orice alt tip, returnează formatul standard
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
    }

  } catch (err) {
    console.error('Eroare la încărcarea diagramei:', err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};

// Șterge o diagramă
exports.deleteDiagram = async (req, res) => {
  const { diagramId } = req.params;
  const userId = req.user.id; // <-- ADAUGAT

  try {
    // <-- ADAUGAT: VERIFICĂ MAI ÎNTÂI DACĂ DIAGRAMA APARȚINE USERULUI
    const checkResult = await pool.query(
      'SELECT id_user FROM diagrame WHERE id_diagrama = $1',
      [diagramId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Diagrama nu a fost găsită' });
    }
    
    if (checkResult.rows[0].id_user !== parseInt(userId)) {
      return res.status(403).json({ message: 'Nu aveți permisiunea să ștergeți această diagramă' });
    }
    
    // Șterge diagrama (acum știm sigur că aparține userului)
    await pool.query('DELETE FROM diagrame WHERE id_diagrama = $1', [diagramId]);
    
    return res.status(200).json({ message: 'Diagrama a fost ștearsă' });
  } catch (err) {
    console.error('Eroare la ștergerea diagramei:', err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};