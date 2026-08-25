import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Profile } from '../lib/types';
import PasswordField from '../components/PasswordField';

export default function Login() {
    const { setProfile } = useAuth();
    const navigate = useNavigate();

    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            const data = await api.post<{ profile: Profile }>('/api/auth/login', { identifier, password });
            setProfile(data.profile);
            navigate('/');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Login failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="stack">
            <div className="page-head">
                <h1>Log In</h1>
                <p className="sub">Use your username or user ID with your password.</p>
            </div>

            <form className="card panel form" onSubmit={submit}>
                <div className="field">
                    <label htmlFor="identifier">Username / User ID</label>
                    <input id="identifier" className="input mono" value={identifier}
                        onChange={e => setIdentifier(e.target.value)} maxLength={64} required
                        autoComplete="username" placeholder="e.g. rahim4821 or 100123" />
                </div>

                <PasswordField id="password" label="Password" value={password} onChange={setPassword}
                    autoComplete="current-password" />

                {error && <div className="form-error" role="alert">{error}</div>}

                <button className="btn btn-primary btn-block" disabled={busy}>
                    {busy ? 'Logging in…' : 'Login'}
                </button>

                <p className="muted center">
                    Forgot your password? <Link to="/recover">Recover with recovery code</Link>
                </p>
                <p className="muted center">
                    New to Tasky? <Link to="/signup">Create a profile</Link>
                </p>
            </form>
        </div>
    );
}
