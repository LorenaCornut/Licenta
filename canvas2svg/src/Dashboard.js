import React from 'react';
import './Home.css';
import logo from './imagini/logo.png';

function Dashboard() {
  return (
    <div className="landing-root">
      <header className="landing-header">
        <div className="logo-group">
          <img src={logo} alt="Canvas 2 SVG Logo" className="logo-icon" />
          <span className="logo-title">
            Canvas <br />2 SVG
          </span>
        </div>
      </header>
      <main className="landing-main modern-bg">
        <section className="landing-center no-bg">
          <h2>Bine ai venit!</h2>
          <div className="dashboard-actions">
            <button className="btn dashboard-btn">Istoric</button>
            <button className="btn dashboard-btn">Șabloane</button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Dashboard;
