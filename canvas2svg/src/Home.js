import React from 'react';
import './Home.css';
import logo from './imagini/logo.png'; 
import img1 from './imagini/img1.png'; 
import img2 from './imagini/img2.png';
import petriImg from './imagini/petri.png';
import bgHome from './imagini/fundal4.png'; 


function Home({ onCreateAccount, onLogin, onHelp, onInfo }) {
  return (
    <div className="landing-root" style={{ backgroundImage: `url(${bgHome})` }}>
      <header className="landing-header">
        <div className="logo-group">
          <img src={logo} alt="Canvas 2 SVG Logo" className="logo-icon" />
          <span className="logo-title">
            Canvas <br />2 SVG
          </span>
        </div>
        <div className="header-actions">
          <button className="header-btn info" onClick={onInfo}>Info</button>
          <button className="header-btn help" onClick={onHelp}>Help</button>
        </div>
      </header>
      <main className="landing-main modern-bg">
        <section className="landing-center no-bg">
          <h1 className="landing-title">
            Canvas 2 SVG
          </h1>
          <p className="landing-desc">
            Aplicație modernă pentru desenarea de grafuri, diagrame UML, rețele Petri și automate.<br />
            Export rapid în SVG pentru integrare web.
          </p>
          <div className="landing-actions">
            <button className="btn login" onClick={onLogin}>Log in</button>
            <button className="btn create" onClick={onCreateAccount}>Create Account</button>
          </div>
          {/*<div className="img-row">
            <img src={img1} alt="Exemplu 1" className="row-img" />
            <img src={img2} alt="Exemplu 2" className="row-img" />
            <img src={petriImg} alt="Exemplu 3" className="row-img" />
            <img src={logo} alt="Exemplu 4" className="row-img" />
          </div>*/}
        </section>
      </main>
    </div>
  );
}

export default Home;
