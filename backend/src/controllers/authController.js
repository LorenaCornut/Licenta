const User = require('../models/user');
const bcrypt = require('bcrypt');
const pool = require('../db');

// Variabile temporare pentru stare user conectat
let isLoggedIn = 0;
let loggedInUsername = null;

exports.login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findByUsername(username);
    if (!user) {
      return res.status(400).json({ message: 'username sau parola incorecta' });
    }
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(400).json({ message: 'username sau parola incorecta' });
    }
    isLoggedIn = 1;
    loggedInUsername = username;
    return res.status(200).json({ message: 'autentificare reusita', user: { id: user.id_user, username: user.username, email: user.email }, isLoggedIn, loggedInUsername });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};

exports.register = async (req, res) => {
  const { username, email, password } = req.body;
  try {
    // Verifică dacă username-ul există
    const userByUsername = await User.findByUsername(username);
    if (userByUsername) {
      return res.status(400).json({ message: 'numele de utilizator este deja folosit' });
    }
    // Verifică dacă email-ul există
    const userByEmail = await User.findByEmail(email);
    if (userByEmail) {
      return res.status(400).json({ message: 'email ul este deja utilizat' });
    }
    // Hash-uiește parola
    const password_hash = await bcrypt.hash(password, 10);
    // Creează userul
    const newUser = await User.create(username, email, password_hash);
    // Setează variabilele de stare
    isLoggedIn = 1;
    loggedInUsername = username;
    return res.status(201).json({ message: 'cont creat cu succes', user: { id: newUser.id_user, username, email }, isLoggedIn, loggedInUsername });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};

// Exportă și variabilele pentru test/demo
exports.getLoginState = () => ({ isLoggedIn, loggedInUsername });

// Get user profile
exports.getProfile = async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      'SELECT id_user, username, email, created_at, profile_picture FROM users WHERE id_user = $1',
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Utilizatorul nu a fost găsit' });
    }
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};

// Update user email
exports.updateEmail = async (req, res) => {
  const { userId } = req.params;
  const { email } = req.body;
  try {
    // Check if email already exists
    const existing = await User.findByEmail(email);
    if (existing && existing.id_user !== parseInt(userId)) {
      return res.status(400).json({ message: 'Acest email este deja folosit' });
    }
    await pool.query(
      'UPDATE users SET email = $1 WHERE id_user = $2',
      [email, userId]
    );
    return res.status(200).json({ message: 'Email actualizat cu succes' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};

// Update user password
exports.updatePassword = async (req, res) => {
  const { userId } = req.params;
  const { currentPassword, newPassword } = req.body;
  try {
    // Get current user
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id_user = $1',
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Utilizatorul nu a fost găsit' });
    }
    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!passwordMatch) {
      return res.status(400).json({ message: 'Parola actuală este incorectă' });
    }
    // Hash new password
    const password_hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id_user = $2',
      [password_hash, userId]
    );
    return res.status(200).json({ message: 'Parola actualizată cu succes' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};

// Update profile picture
exports.updateProfilePicture = async (req, res) => {
  const { userId } = req.params;
  const { profilePicture } = req.body;
  try {
    await pool.query(
      'UPDATE users SET profile_picture = $1 WHERE id_user = $2',
      [profilePicture, userId]
    );
    return res.status(200).json({ message: 'Poza de profil actualizată cu succes' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};
