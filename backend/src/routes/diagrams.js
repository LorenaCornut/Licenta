const express = require('express');
const router = express.Router();
const diagramController = require('../controllers/diagramController');

// Salvează sau actualizează o diagramă
router.post('/save', diagramController.saveDiagram);

// Obține toate diagramele unui utilizator
router.get('/user/:userId', diagramController.getUserDiagrams);

// Încarcă o diagramă specifică
router.get('/:diagramId', diagramController.loadDiagram);

// Șterge o diagramă
router.delete('/:diagramId', diagramController.deleteDiagram);

module.exports = router;
