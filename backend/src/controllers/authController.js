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
    return res.status(200).json({ message: 'autentificare reusita', user: { username: user.username, email: user.email }, isLoggedIn, loggedInUsername });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};
const User = require('../models/user');
const bcrypt = require('bcrypt');

// Variabile temporare pentru stare user conectat
let isLoggedIn = 0;
let loggedInUsername = null;

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
    return res.status(201).json({ message: 'cont creat cu succes', user: { username, email }, isLoggedIn, loggedInUsername });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Eroare server', error: err.message });
  }
};

// Exportă și variabilele pentru test/demo
exports.getLoginState = () => ({ isLoggedIn, loggedInUsername });
