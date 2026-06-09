const pool = require('../db');

/**
 * Helper function to safely parse JSON fields
 */
function safeJsonParse(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      console.warn('Failed to parse JSON string:', value, e);
      return {};
    }
  }
  return value;
}

/**
 * Save UML Object Diagram to database
 * Body: {
 *   title: string,
 *   userId: number,
 *   diagram: { selectedType, elements, connections }
 * }
 */
exports.saveObjectDiagram = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { title, diagram } = req.body;  // <-- SCOTEM userId de aici
    const userId = req.user.id;            // <-- ADAUGAT: ia din token
    
    if (!title || !diagram) {              // <-- SCHIMBAT: verifică doar title și diagram
      return res.status(400).json({ error: 'Missing required fields: title, diagram' });
    }

    const { elements, connections } = diagram;

    await client.query('BEGIN');

    // Get or create diagram type
    const typeResult = await client.query(
      `INSERT INTO tipuri_diagrame (nume_tip) 
       VALUES ($1) 
       ON CONFLICT (nume_tip) DO UPDATE SET nume_tip = EXCLUDED.nume_tip
       RETURNING id_tip`,
      ['UML_OBJECT_DIAGRAM']
    );

    const idTip = typeResult.rows[0].id_tip;

    // Insert into 'diagrame' table
    const diagramResult = await client.query(
      `INSERT INTO diagrame (id_user, titlu, id_tip, data_create, data_update)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id_diagrama`,
      [userId, title, idTip]
    );

    const idDiagrama = diagramResult.rows[0].id_diagrama;

    // Get or create a generic component type for object diagrams
    const componentResult = await client.query(
      `INSERT INTO componente_diagrame (id_tip, nume_componenta, specificatii)
       VALUES ($1, 'UML_OBJECT', '{"type": "object", "description": "UML Object Instance"}')
       ON CONFLICT DO NOTHING
       RETURNING id_componenta`,
      [idTip]
    );

    let idComponenta = componentResult.rows[0]?.id_componenta;
    
    if (!idComponenta) {
      const existingComponent = await client.query(
        `SELECT id_componenta FROM componente_diagrame 
         WHERE id_tip = $1 AND nume_componenta = 'UML_OBJECT' LIMIT 1`,
        [idTip]
      );
      idComponenta = existingComponent.rows[0]?.id_componenta;
    }

    // Get or create a generic relationship type for object diagrams
    const relationshipResult = await client.query(
      `INSERT INTO legaturi_diagrame (id_tip, nume_legatura, specificatii)
       VALUES ($1, 'UML_LINK', '{"type": "link", "description": "UML Object Link"}')
       ON CONFLICT DO NOTHING
       RETURNING id_legatura`,
      [idTip]
    );

    let idLegatura = relationshipResult.rows[0]?.id_legatura;
    
    if (!idLegatura) {
      const existingRelationship = await client.query(
        `SELECT id_legatura FROM legaturi_diagrame 
         WHERE id_tip = $1 AND nume_legatura = 'UML_LINK' LIMIT 1`,
        [idTip]
      );
      idLegatura = existingRelationship.rows[0]?.id_legatura;
    }

    // Insert elements (componente_existente)
    const elementMap = {}; // Map element.id -> database id_instanta
    
    for (const element of elements) {
      const elementResult = await client.query(
        `INSERT INTO componente_existente 
         (id_diagrama, id_componenta, continut, x, y, weight, height)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id_instanta`,
        [
          idDiagrama,
          idComponenta,
          JSON.stringify(element),
          Math.round(element.x || 0),
          Math.round(element.y || 0),
          Math.round(element.width || 150),
          Math.round(element.height || 120)
        ]
      );

      elementMap[element.id] = elementResult.rows[0].id_instanta;
    }

    // Insert connections (legaturi_existente)
    for (const connection of connections) {
      const idStart = elementMap[connection.from];
      const idEnd = elementMap[connection.to];

      if (!idStart || !idEnd) {
        console.warn(`Skipping connection: from=${connection.from} (${idStart}), to=${connection.to} (${idEnd})`);
        continue;
      }

      await client.query(
        `INSERT INTO legaturi_existente
         (id_diagrama, id_legatura, id_start, id_end, text, puncte_intermediare)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          idDiagrama,
          idLegatura,
          idStart,
          idEnd,
          JSON.stringify({ 
            type: connection.type, 
            label: connection.label,
            fromPoint: connection.fromPoint,
            toPoint: connection.toPoint,
            fromEdge: connection.fromEdge,
            fromOffset: typeof connection.fromOffset === 'number' ? connection.fromOffset : 0.5,
            toEdge: connection.toEdge,
            toOffset: typeof connection.toOffset === 'number' ? connection.toOffset : 0.5
          }),
          JSON.stringify(connection.waypoints || [])
        ]
      );
    }

    await client.query('COMMIT');

    res.json({ 
      diagramId: idDiagrama,
      message: 'Object diagram saved successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving object diagram:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

/**
 * Get specific UML Object Diagram
 */
exports.getObjectDiagram = async (req, res) => {
  try {
    const { diagramId } = req.params;
    const userId = req.user.id;  // <-- ADAUGAT

    // Get diagram metadata
    const diagramResult = await pool.query(
      `SELECT d.id_diagrama, d.titlu, d.id_user, d.data_create, d.data_update, t.nume_tip
       FROM diagrame d
       LEFT JOIN tipuri_diagrame t ON d.id_tip = t.id_tip
       WHERE d.id_diagrama = $1`,
      [diagramId]
    );

    if (diagramResult.rows.length === 0) {
      return res.status(404).json({ error: 'Object diagram not found' });
    }

    const diagram = diagramResult.rows[0];
    
    // <-- ADAUGAT: VERIFICĂ PERMISIUNI
    if (diagram.id_user !== parseInt(userId)) {
      return res.status(403).json({ error: 'Access denied. This diagram does not belong to you.' });
    }

    // Get all elements (componente_existente)
    const elementsResult = await pool.query(
      `SELECT id_instanta, continut, x, y, weight, height
       FROM componente_existente 
       WHERE id_diagrama = $1
       ORDER BY id_instanta`,
      [diagramId]
    );

    const elementMap = {};
    const elements = elementsResult.rows.map(row => {
      const element = safeJsonParse(row.continut);
      elementMap[row.id_instanta] = element.id;
      
      element.x = row.x;
      element.y = row.y;
      element.width = row.weight;
      element.height = row.height;
      
      return element;
    });

    // Get all connections (legaturi_existente)
    const connectionsResult = await pool.query(
      `SELECT id_instanta, id_start, id_end, text, puncte_intermediare
       FROM legaturi_existente 
       WHERE id_diagrama = $1
       ORDER BY id_instanta`,
      [diagramId]
    );

    const connections = connectionsResult.rows.map(row => {
      const connectionData = safeJsonParse(row.text);
      const waypoints = safeJsonParse(row.puncte_intermediare || '[]');
      
      return {
        id: row.id_instanta,
        from: elementMap[row.id_start],
        to: elementMap[row.id_end],
        type: connectionData.type,
        label: connectionData.label,
        fromPoint: connectionData.fromPoint,
        toPoint: connectionData.toPoint,
        fromEdge: connectionData.fromEdge,
        fromOffset: typeof connectionData.fromOffset === 'number' ? connectionData.fromOffset : 0.5,
        toEdge: connectionData.toEdge,
        toOffset: typeof connectionData.toOffset === 'number' ? connectionData.toOffset : 0.5,
        controlPoints: waypoints
      };
    });

    res.json({
      diagram: {
        id: diagram.id_diagrama,
        userId: diagram.id_user,
        title: diagram.titlu,
        data: {
          elements: elements,
          connections: connections
        },
        createdAt: diagram.data_create,
        updatedAt: diagram.data_update
      }
    });

  } catch (error) {
    console.error('Error fetching object diagram:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update UML Object Diagram
 * Body: { diagram: { elements, connections } }
 */
exports.updateObjectDiagram = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { diagramId } = req.params;
    const { diagram } = req.body;
    const userId = req.user.id;  // <-- ADAUGAT

    if (!diagram) {
      return res.status(400).json({ error: 'Missing diagram in request body' });
    }

    const { elements, connections } = diagram;

    await client.query('BEGIN');

    // <-- ADAUGAT: VERIFICĂ DACĂ DIAGRAMA EXISTĂ ȘI APARȚINE USERULUI
    const diagramCheck = await client.query(
      `SELECT id_tip, id_user FROM diagrame WHERE id_diagrama = $1`,
      [diagramId]
    );

    if (diagramCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Object diagram not found' });
    }
    
    // <-- ADAUGAT: VERIFICĂ PERMISIUNI
    if (diagramCheck.rows[0].id_user !== parseInt(userId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied. You can only update your own diagrams.' });
    }

    const idTip = diagramCheck.rows[0].id_tip;

    // Get component and relationship type IDs
    const componentResult = await client.query(
      `SELECT id_componenta FROM componente_diagrame 
       WHERE id_tip = $1 AND nume_componenta = 'UML_OBJECT' LIMIT 1`,
      [idTip]
    );

    const relationshipResult = await client.query(
      `SELECT id_legatura FROM legaturi_diagrame 
       WHERE id_tip = $1 AND nume_legatura = 'UML_LINK' LIMIT 1`,
      [idTip]
    );

    if (componentResult.rows.length === 0 || relationshipResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Component or relationship type not found for diagram' });
    }

    const idComponenta = componentResult.rows[0].id_componenta;
    const idLegatura = relationshipResult.rows[0].id_legatura;

    // Delete old connections and elements
    await client.query('DELETE FROM legaturi_existente WHERE id_diagrama = $1', [diagramId]);
    await client.query('DELETE FROM componente_existente WHERE id_diagrama = $1', [diagramId]);

    // Insert new elements
    const elementMap = {};
    
    for (const element of elements) {
      const elementResult = await client.query(
        `INSERT INTO componente_existente 
         (id_diagrama, id_componenta, continut, x, y, weight, height)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id_instanta`,
        [
          diagramId,
          idComponenta,
          JSON.stringify(element),
          Math.round(element.x || 0),
          Math.round(element.y || 0),
          Math.round(element.width || 150),
          Math.round(element.height || 120)
        ]
      );

      elementMap[element.id] = elementResult.rows[0].id_instanta;
    }

    // Insert new connections
    for (const connection of connections) {
      const idStart = elementMap[connection.from];
      const idEnd = elementMap[connection.to];

      if (!idStart || !idEnd) {
        console.warn(`Skipping connection: from=${connection.from} (${idStart}), to=${connection.to} (${idEnd})`);
        continue;
      }

      await client.query(
        `INSERT INTO legaturi_existente
         (id_diagrama, id_legatura, id_start, id_end, text, puncte_intermediare)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          diagramId,
          idLegatura,
          idStart,
          idEnd,
          JSON.stringify({ 
            type: connection.type, 
            label: connection.label,
            fromPoint: connection.fromPoint,
            toPoint: connection.toPoint,
            fromEdge: connection.fromEdge,
            fromOffset: typeof connection.fromOffset === 'number' ? connection.fromOffset : 0.5,
            toEdge: connection.toEdge,
            toOffset: typeof connection.toOffset === 'number' ? connection.toOffset : 0.5
          }),
          JSON.stringify(connection.waypoints || [])
        ]
      );
    }

    // Update diagram timestamp
    await client.query(
      `UPDATE diagrame SET data_update = CURRENT_TIMESTAMP WHERE id_diagrama = $1`,
      [diagramId]
    );

    await client.query('COMMIT');

    res.json({ 
      message: 'Object diagram updated successfully',
      diagramId: diagramId
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating object diagram:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

/**
 * Delete UML Object Diagram
 */
exports.deleteObjectDiagram = async (req, res) => {
  try {
    const { diagramId } = req.params;
    const userId = req.user.id;  // <-- ADAUGAT

    // <-- ADAUGAT: VERIFICĂ MAI ÎNTÂI DACĂ DIAGRAMA APARȚINE USERULUI
    const checkResult = await pool.query(
      `SELECT id_user FROM diagrame 
       WHERE id_diagrama = $1 
       AND id_tip = (SELECT id_tip FROM tipuri_diagrame WHERE nume_tip = 'UML_OBJECT_DIAGRAM')`,
      [diagramId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Object diagram not found' });
    }
    
    if (checkResult.rows[0].id_user !== parseInt(userId)) {
      return res.status(403).json({ error: 'Access denied. You can only delete your own diagrams.' });
    }

    const result = await pool.query(
      `DELETE FROM diagrame
       WHERE id_diagrama = $1 AND id_tip = (SELECT id_tip FROM tipuri_diagrame WHERE nume_tip = 'UML_OBJECT_DIAGRAM')
       RETURNING id_diagrama`,
      [diagramId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Object diagram not found' });
    }

    res.json({ message: 'Object diagram deleted successfully' });

  } catch (error) {
    console.error('Error deleting object diagram:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * List all UML Object Diagrams for a user
 */
exports.listObjectDiagrams = async (req, res) => {
  try {
    const userId = req.user.id;  // <-- SCHIMBAT: ia din token, nu din params

    const result = await pool.query(
      `SELECT 
        id_diagrama,
        titlu,
        data_create,
        data_update
       FROM diagrame
       WHERE id_user = $1 AND id_tip = (SELECT id_tip FROM tipuri_diagrame WHERE nume_tip = 'UML_OBJECT_DIAGRAM')
       ORDER BY data_update DESC`,
      [userId]
    );

    res.json({
      diagrams: result.rows
    });

  } catch (error) {
    console.error('Error listing object diagrams:', error);
    res.status(500).json({ error: error.message });
  }
};
