
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Folosește rutele de autentificare
app.use('/api', authRoutes);

app.get('/', (req, res) => {
  res.send('Backend API funcționează!');
});

app.listen(PORT, () => {
  console.log(`Serverul rulează pe http://localhost:${PORT}`);
});
