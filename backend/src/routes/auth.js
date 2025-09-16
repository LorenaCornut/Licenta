const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');


// Ruta pentru creare cont
router.post('/register', authController.register);

// Ruta pentru login
router.post('/login', authController.login);

module.exports = router;
