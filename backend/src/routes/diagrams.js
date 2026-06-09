const express = require('express');
const router = express.Router();
const diagramController = require('../controllers/diagramController');
const authenticateToken = require('../middleware/auth'); // <-- ADAUGAT

// Salvează diagramă de automat (state diagram)
router.post('/save-state', authenticateToken, diagramController.saveStateDiagram); // <-- ADAUGAT middleware

// Salvează sau actualizează o diagramă (grafuri)
router.post('/save', authenticateToken, diagramController.saveDiagram); // <-- ADAUGAT middleware

// Obține toate diagramele unui utilizator
// SCHIMBAT: /user/list în loc de /user/:userId
router.get('/user/list', authenticateToken, diagramController.getUserDiagrams); // <-- SCHIMBAT ruta

// Încarcă o diagramă specifică
router.get('/:diagramId', authenticateToken, diagramController.loadDiagram); // <-- ADAUGAT middleware

// Șterge o diagramă
router.delete('/:diagramId', authenticateToken, diagramController.deleteDiagram); // <-- ADAUGAT middleware

module.exports = router;