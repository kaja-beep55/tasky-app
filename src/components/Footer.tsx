import { Link } from 'react-router-dom';

export default function Footer() {
    return (
        <footer className="footer">
            <nav aria-label="Legal">
                <Link to="/privacy">Privacy Policy</Link>
                <Link to="/terms">Terms</Link>
                <Link to="/prohibited">Prohibited Activities</Link>
                <Link to="/contact">Contact / Grievance</Link>
            </nav>
            <p className="copy">© {new Date().getFullYear()} Tasky — Complete tasks, earn coins.</p>
        </footer>
    );
}
