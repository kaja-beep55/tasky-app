import { Link, useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { CoinPill } from './Coin';

export default function TopBar() {
    const { profile } = useAuth();
    const navigate = useNavigate();

    return (
        <header className="topbar">
            <Link to="/" className="brand" aria-label="Tasky home">
                <span className="brand-mark">T</span>
                <span>Tasky</span>
            </Link>

            <div className="topbar-spacer" />

            <CoinPill amount={profile?.coins ?? 0} />

            {profile ? (
                <Link to="/profile" className="profile-chip" aria-label="Open your profile">
                    <span className="avatar">{profile.name.charAt(0).toUpperCase()}</span>
                    <span>{profile.name}</span>
                </Link>
            ) : (
                <Link to="/signup" className="profile-chip" aria-label="Create your profile">
                    <span className="avatar">+</span>
                    <span>Create Profile</span>
                </Link>
            )}

            <button
                className="icon-btn"
                onClick={() => navigate('/admin')}
                aria-label="Admin panel"
                title="Admin"
            >
                <Shield size={18} />
            </button>
        </header>
    );
}
