const express = require('express');
const router = express.Router();
const petriNetController = require('../controllers/petriNetController');

/**
 * Salvează o rețea Petri nouă sau actualizează una existentă
 * POST /api/petri-nets/save
 */
router.post('/save', petriNetController.savePetriNet);

/**
 * Obține toate rețelele Petri ale unui utilizator
 * GET /api/petri-nets/user/:userId
 */
router.get('/user/:userId', petriNetController.getUserPetriNets);

/**
 * Șterge o rețea Petri
 * DELETE /api/petri-nets/:diagramId
 */
router.delete('/:diagramId', petriNetController.deletePetriNet);

/**
 * Încarcă o rețea Petri specifică
 * GET /api/petri-nets/:diagramId
 */
router.get('/:diagramId', petriNetController.loadPetriNet);

module.exports = router;
