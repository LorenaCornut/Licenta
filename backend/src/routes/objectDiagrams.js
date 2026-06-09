const express = require('express');
const router = express.Router();
const objectDiagramController = require('../controllers/objectDiagramController');
const authenticateToken = require('../middleware/auth'); // <-- ADAUGAT

/**
 * Save new UML Object Diagram
 * POST /api/object-diagrams
 * Body: { title, diagram: { elements, connections } }
 * (userId se ia din token)
 */
router.post('/', authenticateToken, objectDiagramController.saveObjectDiagram); // <-- ADAUGAT middleware

/**
 * Get specific UML Object Diagram
 * GET /api/object-diagrams/:diagramId
 */
router.get('/:diagramId', authenticateToken, objectDiagramController.getObjectDiagram); // <-- ADAUGAT middleware

/**
 * Update UML Object Diagram
 * PUT /api/object-diagrams/:diagramId
 * Body: { diagram: { elements, connections } }
 */
router.put('/:diagramId', authenticateToken, objectDiagramController.updateObjectDiagram); // <-- ADAUGAT middleware

/**
 * Delete UML Object Diagram
 * DELETE /api/object-diagrams/:diagramId
 */
router.delete('/:diagramId', authenticateToken, objectDiagramController.deleteObjectDiagram); // <-- ADAUGAT middleware

/**
 * List all UML Object Diagrams for a user
 * GET /api/object-diagrams/user/list (SCHIMBAT: fără :userId)
 */
router.get('/user/list', authenticateToken, objectDiagramController.listObjectDiagrams); // <-- SCHIMBAT ruta

module.exports = router;