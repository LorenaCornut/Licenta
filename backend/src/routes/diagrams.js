const express = require('express');
const router = express.Router();
const diagramController = require('../controllers/diagramController');

// Salvează diagramă de automat (state diagram)
router.post('/save-state', diagramController.saveStateDiagram);

// Salvează sau actualizează o diagramă (grafuri)
router.post('/save', diagramController.saveDiagram);

// Obține toate diagramele unui utilizator
router.get('/user/:userId', diagramController.getUserDiagrams);

// Încarcă o diagramă specifică
router.get('/:diagramId', diagramController.loadDiagram);

// Șterge o diagramă
router.delete('/:diagramId', diagramController.deleteDiagram);

module.exports = router;
