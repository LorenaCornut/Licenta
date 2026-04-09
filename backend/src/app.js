
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const diagramRoutes = require('./routes/diagrams');
const petriNetRoutes = require('./routes/petriNets');
const classdiagramRoutes = require('./routes/classDiagrams');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Folosește rutele de autentificare
app.use('/api/auth', authRoutes);

// Folosește rutele pentru diagrame
app.use('/api/diagrams', diagramRoutes);

// Folosește rutele pentru rețele Petri
app.use('/api/petri-nets', petriNetRoutes);

// Folosește rutele pentru diagrame clase
app.use('/api/class-diagrams', classdiagramRoutes);

app.get('/', (req, res) => {
  res.send('Backend API funcționează!');
});

app.listen(PORT, () => {
  console.log(`Serverul rulează pe http://localhost:${PORT}`);
});
