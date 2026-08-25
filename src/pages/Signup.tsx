import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PartyPopper } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Profile } from '../lib/types';
import PasswordField from '../components/PasswordField';

export default function Signup() {
    const { setProfile } = useAuth();
    const navigate = useNavigate();

    const [name, setName] = useState('');
    const [country, setCountry] = useState('');
    const [state, setState] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [created, setCreated] = useState<{ profile: Profile; recoveryCode: string } | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirm) {
            setError('Passwords do not match');
            return;
        }

        setBusy(true);
        try {
            const data = await api.post<{ profile: Profile; recoveryCode: string }>('/api/auth/signup', {
                name, country, state, password,
            });
            setProfile(data.profile);
            setCreated({ profile: data.profile, recoveryCode: data.recoveryCode });
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not create profile');
        } finally {
            setBusy(false);
        }
    };

    if (created) {
        return (
            <div className="stack">
                <div className="page-head">
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        Profile created <PartyPopper size={24} color="var(--gold-deep)" />
                    </h1>
                    <p className="sub">Save these details somewhere safe. You need them to log in again.</p>
                </div>

                <div className="card panel">
                    <div className="kv-grid">
                        <div className="kv">
                            <span className="k">User ID</span>
                            <span className="v mono">{created.profile.userNumber}</span>
                        </div>
                        <div className="kv">
                            <span className="k">Username</span>
                            <span className="v mono">@{created.profile.username}</span>
                        </div>
                    </div>

                    <div className="divider" />

                    <div className="field">
                        <label>Recovery Code — shown only once</label>
                        <div className="recovery-code-box">{created.recoveryCode}</div>
                        <p className="muted">
                            If you forget your password, this code is the only way back into your account.
                            We store it as a secure hash and can never show it again.
                        </p>
                    </div>

                    <button className="btn btn-primary btn-block" onClick={() => navigate('/')}>
                        Continue to Tasks
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="stack">
            <div className="page-head">
                <h1>Create Profile</h1>
                <p className="sub">One profile is enough. No email, no phone number, no OTP.</p>
            </div>

            <form className="card panel form" onSubmit={submit}>
                <div className="field">
                    <label htmlFor="name">Name</label>
                    <input id="name" className="input" value={name} onChange={e => setName(e.target.value)}
                        maxLength={60} required autoComplete="name" />
                </div>
                <div className="field">
                    <label htmlFor="country">Country</label>
                    <input id="country" className="input" value={country} onChange={e => setCountry(e.target.value)}
                        maxLength={60} required autoComplete="country-name" />
                </div>
                <div className="field">
                    <label htmlFor="state">State</label>
                    <input id="state" className="input" value={state} onChange={e => setState(e.target.value)}
                        maxLength={60} required autoComplete="address-level1" />
                </div>

                <PasswordField id="password" label="Create Password" value={password} onChange={setPassword} />
                <PasswordField id="confirm" label="Confirm Password" value={confirm} onChange={setConfirm} />

                {error && <div className="form-error" role="alert">{error}</div>}

                <button className="btn btn-primary btn-block" disabled={busy}>
                    {busy ? 'Creating…' : 'Create Profile'}
                </button>

                <p className="muted center">
                    Already have a profile? <Link to="/login">Log in</Link>
                </p>
            </form>
        </div>
    );
}
