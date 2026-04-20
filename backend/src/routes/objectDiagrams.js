const express = require('express');
const router = express.Router();
const objectDiagramController = require('../controllers/objectDiagramController');

/**
 * Save new UML Object Diagram
 * POST /api/object-diagrams
 * Body: { title, userId, diagram: { elements, connections } }
 */
router.post('/', objectDiagramController.saveObjectDiagram);

/**
 * Get specific UML Object Diagram
 * GET /api/object-diagrams/:diagramId
 */
router.get('/:diagramId', objectDiagramController.getObjectDiagram);

/**
 * Update UML Object Diagram
 * PUT /api/object-diagrams/:diagramId
 * Body: { diagram: { elements, connections } }
 */
router.put('/:diagramId', objectDiagramController.updateObjectDiagram);

/**
 * Delete UML Object Diagram
 * DELETE /api/object-diagrams/:diagramId
 */
router.delete('/:diagramId', objectDiagramController.deleteObjectDiagram);

/**
 * List all UML Object Diagrams for a user
 * GET /api/object-diagrams/user/:userId
 */
router.get('/user/:userId', objectDiagramController.listObjectDiagrams);

module.exports = router;
