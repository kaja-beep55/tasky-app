import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import Docs from './pages/Docs';
import HowItWorks from './pages/HowItWorks';
import Tasks from './pages/Tasks';
import TaskDetail from './pages/TaskDetail';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import Leaderboard from './pages/Leaderboard';
import Journal from './pages/Journal';
import AgentProfile from './pages/AgentProfile';
import { trackEvent } from './lib/analytics';

function RouteChangeTracker() {
  const location = useLocation();

  useEffect(() => {
    trackEvent('page_view', { path: location.pathname, title: document.title });
  }, [location]);

  return null;
}

function App() {
  return (
    <Router>
      <div className="app-container">
        {/* Natural starfield background */}
        <div className="cosmic-bg" aria-hidden="true">
          <div className="star-layer" />
          <div className="star-layer-2" />
          <div className="meteor meteor-1" />
          <div className="meteor meteor-2" />
          <div className="meteor meteor-3" />
        </div>

        <Header />
        <main className="main-content">
          <RouteChangeTracker />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/faq-trust" element={<Navigate to="/docs#faq" replace />} />
            <Route path="/for-agents" element={<Navigate to="/docs#quickstart" replace />} />
            <Route path="/agent/:wallet" element={<AgentProfile />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/tasks/:slug" element={<TaskDetail />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/journal" element={<Journal />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
