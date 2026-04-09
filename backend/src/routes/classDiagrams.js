const express = require('express');
const router = express.Router();
const classController = require('../controllers/classController');

/**
 * Save new UML Class Diagram
 * POST /api/class-diagrams
 * Body: { title, userId, diagram: { selectedType, elements, connections } }
 */
router.post('/', classController.saveClassDiagram);

/**
 * Get specific UML Class Diagram
 * GET /api/class-diagrams/:diagramId
 */
router.get('/:diagramId', classController.getClassDiagram);

/**
 * Update UML Class Diagram
 * PUT /api/class-diagrams/:diagramId
 * Body: { diagram: { selectedType, elements, connections } }
 */
router.put('/:diagramId', classController.updateClassDiagram);

/**
 * Delete UML Class Diagram
 * DELETE /api/class-diagrams/:diagramId
 */
router.delete('/:diagramId', classController.deleteClassDiagram);

/**
 * List all UML Class Diagrams for a user
 * GET /api/class-diagrams/user/:userId
 */
router.get('/user/:userId', classController.listClassDiagrams);

module.exports = router;
