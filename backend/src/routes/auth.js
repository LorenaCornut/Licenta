const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/auth'); // <-- ADUAGĂ

// Rute publice (nu necesită autentificare)
router.post('/register', authController.register);
router.post('/login', authController.login);

// Rute protejate (necesită token valid)
router.get('/profile', authenticateToken, authController.getProfile);
router.put('/profile/email', authenticateToken, authController.updateEmail);
router.put('/profile/password', authenticateToken, authController.updatePassword);
router.put('/profile/picture', authenticateToken, authController.updateProfilePicture);

module.exports = router;
