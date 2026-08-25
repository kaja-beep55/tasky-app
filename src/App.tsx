import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import TopBar from './components/TopBar';
import Footer from './components/Footer';
import Home from './pages/Home';
import TaskDetail from './pages/TaskDetail';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Recover from './pages/Recover';
import Profile from './pages/Profile';
import CoinHistory from './pages/CoinHistory';
import AdminUnlock from './pages/AdminUnlock';
import AdminPanel from './pages/admin/AdminPanel';
import { Contact, Privacy, Prohibited, Terms } from './pages/Policies';

export default function App() {
    return (
        <Router>
            <AuthProvider>
                <div className="app-shell">
                    <TopBar />
                    <main className="app-main">
                        <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="/tasks/:taskNumber" element={<TaskDetail />} />
                            <Route path="/signup" element={<Signup />} />
                            <Route path="/login" element={<Login />} />
                            <Route path="/recover" element={<Recover />} />
                            <Route path="/profile" element={<Profile />} />
                            <Route path="/coins" element={<CoinHistory />} />
                            <Route path="/admin" element={<AdminUnlock />} />
                            <Route path="/admin/panel" element={<AdminPanel />} />
                            <Route path="/privacy" element={<Privacy />} />
                            <Route path="/terms" element={<Terms />} />
                            <Route path="/prohibited" element={<Prohibited />} />
                            <Route path="/contact" element={<Contact />} />
                            <Route path="*" element={<Home />} />
                        </Routes>
                    </main>
                    <Footer />
                </div>
            </AuthProvider>
        </Router>
    );
}
