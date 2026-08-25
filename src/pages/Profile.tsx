import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { History, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { CoinPill } from '../components/Coin';

export default function Profile() {
    const { profile, loading, logout } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!loading && !profile) navigate('/login', { replace: true });
    }, [loading, profile, navigate]);

    if (loading || !profile) {
        return <div className="loading-block"><span className="spinner" aria-label="Loading profile" /></div>;
    }

    return (
        <div className="stack">
            <div className="page-head">
                <h1>Your Profile</h1>
            </div>

            <div className="card panel">
                <div className="profile-banner" style={{ background: 'none', border: 'none', padding: 0 }}>
                    <span className="avatar">{profile.name.charAt(0).toUpperCase()}</span>
                    <span className="who">
                        <span className="name">{profile.name}</span>
                        <span className="hello mono">@{profile.username}</span>
                    </span>
                    <span className={`status-tag ${profile.status}`}>{profile.status}</span>
                </div>

                <div className="divider" />

                <div className="kv-grid">
                    <div className="kv">
                        <span className="k">User ID</span>
                        <span className="v mono">{profile.userNumber}</span>
                    </div>
                    <div className="kv">
                        <span className="k">Username</span>
                        <span className="v mono">@{profile.username}</span>
                    </div>
                    <div className="kv">
                        <span className="k">Country</span>
                        <span className="v">{profile.country}</span>
                    </div>
                    <div className="kv">
                        <span className="k">State</span>
                        <span className="v">{profile.state}</span>
                    </div>
                </div>

                <div className="divider" />

                <div className="kv">
                    <span className="k">Current Coins</span>
                    <CoinPill amount={profile.coins} />
                </div>
            </div>

            <Link to="/coins" className="btn btn-outline btn-block">
                <History size={17} /> Coin History
            </Link>

            <button className="btn btn-danger btn-block" onClick={() => { void logout().then(() => navigate('/')); }}>
                <LogOut size={17} /> Log Out
            </button>
        </div>
    );
}
