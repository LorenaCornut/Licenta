const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');


// Ruta pentru creare cont
router.post('/register', authController.register);

// Ruta pentru login
router.post('/login', authController.login);

// Rute pentru profil
router.get('/profile/:userId', authController.getProfile);
router.put('/profile/:userId/email', authController.updateEmail);
router.put('/profile/:userId/password', authController.updatePassword);
router.put('/profile/:userId/picture', authController.updateProfilePicture);

module.exports = router;
