const express = require('express');
const router = express.Router();
const classController = require('../controllers/classController');
const authenticateToken = require('../middleware/auth'); // <-- ADAUGAT

/**
 * Save new UML Class Diagram
 * POST /api/class-diagrams
 * Body: { title, diagram: { selectedType, elements, connections } }
 * (userId se ia din token)
 */
router.post('/', authenticateToken, classController.saveClassDiagram); // <-- ADAUGAT middleware

/**
 * Get specific UML Class Diagram
 * GET /api/class-diagrams/:diagramId
 */
router.get('/:diagramId', authenticateToken, classController.getClassDiagram); // <-- ADAUGAT middleware

/**
 * Update UML Class Diagram
 * PUT /api/class-diagrams/:diagramId
 * Body: { diagram: { selectedType, elements, connections } }
 */
router.put('/:diagramId', authenticateToken, classController.updateClassDiagram); // <-- ADAUGAT middleware

/**
 * Delete UML Class Diagram
 * DELETE /api/class-diagrams/:diagramId
 */
router.delete('/:diagramId', authenticateToken, classController.deleteClassDiagram); // <-- ADAUGAT middleware

/**
 * List all UML Class Diagrams for a user
 * GET /api/class-diagrams/user/list (SCHIMBAT: fără :userId)
 */
router.get('/user/list', authenticateToken, classController.listClassDiagrams); // <-- SCHIMBAT ruta

module.exports = router;