const express = require('express');
const router = express.Router();
const petriNetController = require('../controllers/petriNetController');
const authenticateToken = require('../middleware/auth'); // <-- ADAUGAT

/**
 * Salvează o rețea Petri nouă sau actualizează una existentă
 * POST /api/petri-nets/save
 */
router.post('/save', authenticateToken, petriNetController.savePetriNet); // <-- ADAUGAT middleware

/**
 * Obține toate rețelele Petri ale unui utilizator
 * GET /api/petri-nets/user/list (SCHIMBAT: fără :userId)
 */
router.get('/user/list', authenticateToken, petriNetController.getUserPetriNets); // <-- SCHIMBAT ruta

/**
 * Șterge o rețea Petri
 * DELETE /api/petri-nets/:diagramId
 */
router.delete('/:diagramId', authenticateToken, petriNetController.deletePetriNet); // <-- ADAUGAT middleware

/**
 * Încarcă o rețea Petri specifică
 * GET /api/petri-nets/:diagramId
 */
router.get('/:diagramId', authenticateToken, petriNetController.loadPetriNet); // <-- ADAUGAT middleware

module.exports = router;