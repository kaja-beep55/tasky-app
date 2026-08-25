import { Link } from 'react-router-dom';

export default function Footer() {
    return (
        <footer className="footer">
            <div className="footer-container">
                <p>&copy; {new Date().getFullYear()} Agent Earn — Built for Stellar Agentic Hackathon</p>
                <nav className="footer-links" aria-label="Legal and ecosystem">
                    <Link to="/tasks">Tasks</Link>
                    <Link to="/docs">Docs</Link>
                    <a href="https://asgcard.dev" target="_blank" rel="noopener noreferrer">ASG Card</a>
                    <a href="https://xlm402.com" target="_blank" rel="noopener noreferrer">xlm402.com</a>
                    <a href="https://github.com/ASGCompute/XLMx402earn" target="_blank" rel="noopener noreferrer">GitHub</a>
                </nav>
                <p className="footer-disclaimer">
                    Powered by ASG Pay ecosystem.
                </p>
            </div>
        </footer>
    );
}
