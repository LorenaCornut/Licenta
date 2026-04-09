const pool = require('../db');

/**
 * Helper function to safely parse JSON fields
 * PostgreSQL JSONB can return as object or string depending on driver
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
  // Already an object
  return value;
}

/**
 * Save UML Class Diagram to database
 * Body: {
 *   title: string,
 *   userId: number,
 *   diagram: { selectedType, elements, connections }
 * }
 */
exports.saveClassDiagram = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { title, userId, diagram } = req.body;
    
    if (!title || !userId || !diagram) {
      return res.status(400).json({ error: 'Missing required fields: title, userId, diagram' });
    }

    const { selectedType, elements, connections } = diagram;

    await client.query('BEGIN');

    // 1. Get or create diagram type for Class Diagrams
    const typeResult = await client.query(
      `INSERT INTO tipuri_diagrame (nume_tip) 
       VALUES ('UML_CLASS_DIAGRAM') 
       ON CONFLICT (nume_tip) DO UPDATE SET nume_tip = EXCLUDED.nume_tip
       RETURNING id_tip`
    );

    const idTip = typeResult.rows[0].id_tip;

    // 2. Insert into 'diagrame' table
    const diagramResult = await client.query(
      `INSERT INTO diagrame (id_user, titlu, id_tip, data_create, data_update)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id_diagrama`,
      [userId, title, idTip]
    );

    const idDiagrama = diagramResult.rows[0]?.id_diagrama;
    if (!idDiagrama) {
      throw new Error('Failed to create diagram');
    }

    // 3. Get or create a generic component type for class diagrams
    const componentResult = await client.query(
      `INSERT INTO componente_diagrame (id_tip, nume_componenta, specificatii)
       VALUES ($1, 'UML_CLASS', '{"type": "class", "description": "UML Class Element"}')
       ON CONFLICT DO NOTHING
       RETURNING id_componenta`,
      [idTip]
    );

    let idComponenta = componentResult.rows[0]?.id_componenta;
    
    // If it already exists, get the ID
    if (!idComponenta) {
      const existingComponent = await client.query(
        `SELECT id_componenta FROM componente_diagrame 
         WHERE id_tip = $1 AND nume_componenta = 'UML_CLASS' LIMIT 1`,
        [idTip]
      );
      idComponenta = existingComponent.rows[0]?.id_componenta;
    }

    // 4. Get or create a generic relationship type for class diagrams
    const relationshipResult = await client.query(
      `INSERT INTO legaturi_diagrame (id_tip, nume_legatura, specificatii)
       VALUES ($1, 'UML_ASSOCIATION', '{"type": "association", "description": "UML Class Relationship"}')
       ON CONFLICT DO NOTHING
       RETURNING id_legatura`,
      [idTip]
    );

    let idLegatura = relationshipResult.rows[0]?.id_legatura;
    
    if (!idLegatura) {
      const existingRelationship = await client.query(
        `SELECT id_legatura FROM legaturi_diagrame 
         WHERE id_tip = $1 AND nume_legatura = 'UML_ASSOCIATION' LIMIT 1`,
        [idTip]
      );
      idLegatura = existingRelationship.rows[0]?.id_legatura;
    }

    // 5. Insert elements (componente_existente)
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

    // 6. Insert connections (legaturi_existente)
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
          JSON.stringify({ type: connection.type, label: connection.label }),
          JSON.stringify(connection.waypoints || [])
        ]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Diagram saved successfully',
      diagramId: idDiagrama
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving diagram:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

/**
 * Get UML Class Diagram from database
 * Returns: { selectedType, elements, connections }
 */
exports.getClassDiagram = async (req, res) => {
  try {
    const { diagramId } = req.params;

    // Get diagram metadata
    const diagramResult = await pool.query(
      `SELECT id_diagrama, titlu, id_user, data_create, data_update
       FROM diagrame WHERE id_diagrama = $1`,
      [diagramId]
    );

    if (diagramResult.rows.length === 0) {
      return res.status(404).json({ error: 'Diagram not found' });
    }

    const diagram = diagramResult.rows[0];

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
      elementMap[row.id_instanta] = element.id; // Map DB id -> element id
      
      // Ensure position and size are set from DB
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
        from: elementMap[row.id_start],
        to: elementMap[row.id_end],
        type: connectionData.type,
        label: connectionData.label,
        waypoints: waypoints
      };
    });

    res.json({
      success: true,
      diagram: {
        id: diagram.id_diagrama,
        title: diagram.titlu,
        userId: diagram.id_user,
        createdAt: diagram.data_create,
        updatedAt: diagram.data_update,
        type: 'UML_CLASS_DIAGRAM',
        data: {
          selectedType: 'CLASS',
          elements,
          connections
        }
      }
    });

  } catch (error) {
    console.error('Error fetching diagram:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update UML Class Diagram (replace entire content)
 */
exports.updateClassDiagram = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { diagramId } = req.params;
    const { diagram } = req.body;

    if (!diagram) {
      return res.status(400).json({ error: 'Missing diagram data' });
    }

    const { selectedType, elements, connections } = diagram;

    await client.query('BEGIN');

    // Get the id_tip from existing diagram
    const diagramTypeResult = await client.query(
      'SELECT id_tip FROM diagrame WHERE id_diagrama = $1',
      [diagramId]
    );

    if (diagramTypeResult.rows.length === 0) {
      throw new Error('Diagram not found');
    }

    const idTip = diagramTypeResult.rows[0].id_tip;

    // Get or create component and relationship IDs for this type
    const componentResult = await client.query(
      `SELECT id_componenta FROM componente_diagrame 
       WHERE id_tip = $1 LIMIT 1`,
      [idTip]
    );

    let idComponenta = componentResult.rows[0]?.id_componenta;

    const relationshipResult = await client.query(
      `SELECT id_legatura FROM legaturi_diagrame 
       WHERE id_tip = $1 LIMIT 1`,
      [idTip]
    );

    let idLegatura = relationshipResult.rows[0]?.id_legatura;

    // Delete old elements and connections
    await client.query('DELETE FROM legaturi_existente WHERE id_diagrama = $1', [diagramId]);
    await client.query('DELETE FROM componente_existente WHERE id_diagrama = $1', [diagramId]);

    // Update timestamp
    await client.query(
      'UPDATE diagrame SET data_update = CURRENT_TIMESTAMP WHERE id_diagrama = $1',
      [diagramId]
    );

    // Reinsert elements
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

    // Reinsert connections
    for (const connection of connections) {
      const idStart = elementMap[connection.from];
      const idEnd = elementMap[connection.to];

      if (!idStart || !idEnd) continue;

      await client.query(
        `INSERT INTO legaturi_existente
         (id_diagrama, id_legatura, id_start, id_end, text, puncte_intermediare)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          diagramId,
          idLegatura,
          idStart,
          idEnd,
          JSON.stringify({ type: connection.type, label: connection.label }),
          JSON.stringify(connection.waypoints || [])
        ]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Diagram updated successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating diagram:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

/**
 * Delete UML Class Diagram
 */
exports.deleteClassDiagram = async (req, res) => {
  try {
    const { diagramId } = req.params;

    const result = await pool.query(
      'DELETE FROM diagrame WHERE id_diagrama = $1 AND id_user = $2',
      [diagramId, req.user?.id] // Ensure user can only delete their own diagrams
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Diagram not found or no permission' });
    }

    res.json({ success: true, message: 'Diagram deleted' });

  } catch (error) {
    console.error('Error deleting diagram:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * List all UML Class Diagrams for a user
 */
exports.listClassDiagrams = async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT id_diagrama, titlu, data_create, data_update
       FROM diagrame 
       WHERE id_user = $1 AND id_tip = (SELECT id_tip FROM tipuri_diagrame WHERE nume_tip = 'UML_CLASS_DIAGRAM')
       ORDER BY data_update DESC`,
      [userId]
    );

    res.json({
      success: true,
      diagrams: result.rows
    });

  } catch (error) {
    console.error('Error listing diagrams:', error);
    res.status(500).json({ error: error.message });
  }
};
