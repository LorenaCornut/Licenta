const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  // Obține token din header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"
  
  if (!token) {
    return res.status(401).json({ message: 'Acces neautorizat. Token lipsă.' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Adaugă info utilizator în request
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Token invalid sau expirat' });
  }
};

module.exports = authenticateToken;