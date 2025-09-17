import React from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';

import Home from './Home';
import CreateAccount from './CreateAccount';
import Login from './Login';
import Help from './Help';
import Info from './Info';
import Dashboard from './Dashboard';
import GraphEditor from './GraphEditor';
import './App.css';

function HomeWithNav() {
  const navigate = useNavigate();
  return <Home onCreateAccount={() => navigate('/createaccount')} onLogin={() => navigate('/login')} onHelp={() => navigate('/help')} onInfo={() => navigate('/info')} />;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomeWithNav />} />
        <Route path="/createaccount" element={<CreateAccount />} />
        <Route path="/login" element={<Login />} />
        <Route path="/help" element={<Help />} />
        <Route path="/info" element={<Info />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/graph" element={<GraphEditor />} />
      </Routes>
    </Router>
  );
}

export default App;
