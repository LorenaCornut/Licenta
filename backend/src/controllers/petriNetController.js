const pool = require('../db');

/**
 * Salvează o rețea Petri nouă sau actualizează una existentă
 * Urmează EXACT același pattern ca saveDiagram din diagramController
 */
exports.savePetriNet = async (req, res) => {
  let { title, places, transitions, arcs, diagramId } = req.body;  // <-- SCOTEM userId
  const userId = req.user.id;  // <-- ADAUGAT: ia din token

  try {
    if (!title) {  // <-- SCHIMBAT: verifică doar title (userId vine din token)
      return res.status(400).json({ message: 'Lipsa titlu!' });
    }


    const tipDiagrama = 'Rețea Petri';

    console.log('Save Petri request:', {
      tipDiagrama,
      hasPlaces: !!places,
      hasTransitions: !!transitions,
      hasArcs: !!arcs,
      diagramId: diagramId || 'NEW'
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

    // Componenta: "Poziție" pentru locuri, "Tranziție" pentru tranziții (ambele sunt componente)
    let componentaResult = await pool.query(
      'SELECT id_componenta FROM componente_diagrame WHERE id_tip = $1 AND nume_componenta = $2',
      [idTip, 'Poziție']
    );

    let idComponenta;
    if (componentaResult.rows.length === 0) {
      const insertComp = await pool.query(
        'INSERT INTO componente_diagrame (id_tip, nume_componenta, specificatii) VALUES ($1, $2, $3) RETURNING id_componenta',
        [idTip, 'Poziție', JSON.stringify({ radius: 25 })]
      );
      idComponenta = insertComp.rows[0].id_componenta;
    } else {
      idComponenta = componentaResult.rows[0].id_componenta;
    }

    // Legătură: "Arc" pentru arcurile din rețea
    let legaturaResult = await pool.query(
      'SELECT id_legatura FROM legaturi_diagrame WHERE id_tip = $1 AND nume_legatura = $2',
      [idTip, 'Arc']
    );

    let idLegatura;
    if (legaturaResult.rows.length === 0) {
      const insertLeg = await pool.query(
        'INSERT INTO legaturi_diagrame (id_tip, nume_legatura, specificatii) VALUES ($1, $2, $3) RETURNING id_legatura',
        [idTip, 'Arc', JSON.stringify({ directed: true })]
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

    // Salvează componentele (locuri + tranziții)
    const nodeIdMap = {};
    
    // Salvează locurile (places) - sunt "Poziție" type
    if (places && Array.isArray(places)) {
      for (const place of places) {
        const placeRadius = place.radius || 25;
        const placeResult = await pool.query(
          `INSERT INTO componente_existente 
           (id_diagrama, id_componenta, continut, x, y, weight, height) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) 
           RETURNING id_instanta`,
          [
            idDiagrama,
            idComponenta,
            JSON.stringify({ 
              label: place.label || '',
              originalId: place.id,
              type: 'place',
              tokens: place.tokens || 0,
              radius: placeRadius
            }),
            Math.round(place.x || 0),
            Math.round(place.y || 0),
            Math.round(placeRadius * 2),
            Math.round(placeRadius * 2)
          ]
        );
        nodeIdMap[place.id] = placeResult.rows[0].id_instanta;
      }
      console.log(`  ✓ ${places.length} locuri salvate`);
    }

    // Salvează tranziții (transitions)
    if (transitions && Array.isArray(transitions)) {
      for (const transition of transitions) {
        const transWidth = transition.width || 50;
        const transHeight = transition.height || 30;
        const transResult = await pool.query(
          `INSERT INTO componente_existente 
           (id_diagrama, id_componenta, continut, x, y, weight, height) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) 
           RETURNING id_instanta`,
          [
            idDiagrama,
            idComponenta,
            JSON.stringify({ 
              label: transition.label || '',
              originalId: transition.id,
              type: 'transition',
              width: transWidth,
              height: transHeight
            }),
            Math.round(transition.x || 0),
            Math.round(transition.y || 0),
            Math.round(transWidth),
            Math.round(transHeight)
          ]
        );
        nodeIdMap[transition.id] = transResult.rows[0].id_instanta;
      }
      console.log(`  ✓ ${transitions.length} tranziții salvate`);
    }

    // Salvează arcurile (connections)
    if (arcs && Array.isArray(arcs)) {
      let arcCount = 0;
      for (const arc of arcs) {
        const idStart = nodeIdMap[arc.from];
        const idEnd = nodeIdMap[arc.to];

        if (idStart && idEnd) {
          const labelValue = (arc.label && arc.label.trim() !== '') ? arc.label.trim() : '1';
          const routingPoints = arc.controlPoints || [];
          
          console.log(`  Arc: ${arc.from} -> ${arc.to}, label="${labelValue}", points=${routingPoints.length}`);
          
          await pool.query(
            `INSERT INTO legaturi_existente 
             (id_diagrama, id_legatura, id_start, id_end, text, puncte_intermediare) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              idDiagrama,
              idLegatura,
              idStart,
              idEnd,
              JSON.stringify({ label: labelValue }),
              JSON.stringify(routingPoints)
            ]
          );
          arcCount++;
        } else {
          console.warn(`  ⚠️ Arc ignorat: ${arc.from} -> ${arc.to} (noduri nu găsite în nodeIdMap)`);
        }
      }
      console.log(`  ✓ ${arcCount} arce salvate`);
    }

    console.log(`✓ Rețea Petri salvată: ID=${idDiagrama}, ${places?.length || 0} locuri, ${transitions?.length || 0} tranziții, ${arcs?.length || 0} arce`);

    return res.status(200).json({
      message: 'Rețea Petri salvată cu succes!',
      diagramId: idDiagrama
    });

  } catch (err) {
    console.error('Eroare la salvarea Rețelei Petri:', err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};

/**
 * Încarcă o rețea Petri din baza de date
 */
exports.loadPetriNet = async (req, res) => {
  const { diagramId } = req.params;
  const userId = req.user.id;  // <-- ADAUGAT

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
    
    // <-- ADAUGAT: VERIFICĂ PERMISIUNI
    if (diagram.id_user !== parseInt(userId)) {
      return res.status(403).json({ message: 'Nu aveți permisiunea să accesați această rețea Petri' });
    }

    // Obține componentele (locuri și tranziții)
    const componentsResult = await pool.query(
      `SELECT ce.id_instanta, ce.continut, ce.x, ce.y, ce.weight, ce.height
       FROM componente_existente ce
       WHERE ce.id_diagrama = $1
       ORDER BY ce.id_instanta ASC`,
      [diagramId]
    );

    // Obține arcurile
    const arcsResult = await pool.query(
      `SELECT le.id_instanta, le.id_start, le.id_end, le.text, le.puncte_intermediare
       FROM legaturi_existente le
       WHERE le.id_diagrama = $1
       ORDER BY le.id_instanta ASC`,
      [diagramId]
    );

    // Mapare: id_instanta din DB -> node object
    const nodeMap = {};
    const places = [];
    const transitions = [];

    // Procesează componente
    for (const component of componentsResult.rows) {
      const continut = typeof component.continut === 'string' 
        ? JSON.parse(component.continut) 
        : component.continut;

      const element = {
        id: continut.originalId || `node-${component.id_instanta}`,
        x: component.x,
        y: component.y,
        label: continut.label || ''
      };

      nodeMap[component.id_instanta] = element;

      if (continut.type === 'place') {
        element.tokens = continut.tokens || 0;
        element.radius = continut.radius || (component.weight ? component.weight / 2 : 25);
        places.push(element);
      } else if (continut.type === 'transition') {
        element.width = continut.width || component.weight || 50;
        element.height = continut.height || component.height || 30;
        transitions.push(element);
      }
    }

    // Procesează arcuri
    const arcs = [];
    for (const arc of arcsResult.rows) {
      const text = typeof arc.text === 'string' 
        ? JSON.parse(arc.text) 
        : arc.text;
      
      const routingPoints = arc.puncte_intermediare 
        ? (typeof arc.puncte_intermediare === 'string' 
          ? JSON.parse(arc.puncte_intermediare) 
          : arc.puncte_intermediare)
        : [];

      const fromNode = nodeMap[arc.id_start];
      const toNode = nodeMap[arc.id_end];

      if (fromNode && toNode) {
        arcs.push({
          id: `arc-${arc.id_instanta}`,
          from: fromNode.id,
          to: toNode.id,
          label: text.label || '1',
          controlPoints: routingPoints
        });
      }
    }

    console.log(`✓ Rețea Petri încărcată: ID=${diagramId}, ${places.length} locuri, ${transitions.length} tranziții, ${arcs.length} arce`);

    return res.status(200).json({
      diagram: {
        id: diagram.id_diagrama,
        title: diagram.titlu,
        type: diagram.nume_tip,
        createdAt: diagram.data_create,
        updatedAt: diagram.data_update
      },
      places: places,
      transitions: transitions,
      arcs: arcs
    });

  } catch (err) {
    console.error('Eroare la încărcarea Rețelei Petri:', err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};

/**
 * Obține toate rețelele Petri ale unui utilizator
 */
exports.getUserPetriNets = async (req, res) => {
  const userId = req.user.id;  // <-- SCHIMBAT: ia din token, nu din params

  try {
    const result = await pool.query(
      `SELECT d.id_diagrama, d.titlu, d.data_create, d.data_update, COUNT(ce.id_instanta) as elements
       FROM diagrame d
       LEFT JOIN componente_existente ce ON d.id_diagrama = ce.id_diagrama
       WHERE d.id_user = $1 AND d.id_tip = (SELECT id_tip FROM tipuri_diagrame WHERE nume_tip = 'Rețea Petri')
       GROUP BY d.id_diagrama, d.titlu, d.data_create, d.data_update
       ORDER BY d.data_update DESC`,
      [userId]
    );

    return res.status(200).json({
      diagrams: result.rows
    });
  } catch (err) {
    console.error('Eroare la obținerea rețelelor Petri:', err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};

/**
 * Șterge o rețea Petri
 */
exports.deletePetriNet = async (req, res) => {
  const { diagramId } = req.params;
  const userId = req.user.id;  // <-- ADAUGAT

  try {
    // <-- ADAUGAT: VERIFICĂ MAI ÎNTÂI DACĂ DIAGRAMA APARȚINE USERULUI
    const checkResult = await pool.query(
      `SELECT id_user FROM diagrame 
       WHERE id_diagrama = $1 
       AND id_tip = (SELECT id_tip FROM tipuri_diagrame WHERE nume_tip = 'Rețea Petri')`,
      [diagramId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Rețeaua Petri nu a fost găsită' });
    }
    
    if (checkResult.rows[0].id_user !== parseInt(userId)) {
      return res.status(403).json({ message: 'Nu aveți permisiunea să ștergeți această rețea Petri' });
    }

    // Șterge arcurile
    await pool.query('DELETE FROM legaturi_existente WHERE id_diagrama = $1', [diagramId]);
    
    // Șterge componentele
    await pool.query('DELETE FROM componente_existente WHERE id_diagrama = $1', [diagramId]);
    
    // Șterge diagrama
    const result = await pool.query(
      'DELETE FROM diagrame WHERE id_diagrama = $1 RETURNING id_diagrama',
      [diagramId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Diagrama nu a fost găsită' });
    }

    console.log(`✓ Rețea Petri ștearsă: ID=${diagramId}`);

    return res.status(200).json({
      message: 'Rețea Petri ștearsă cu succes!',
      diagramId: diagramId
    });
  } catch (err) {
    console.error('Eroare la ștergerea Rețelei Petri:', err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};