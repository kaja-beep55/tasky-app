import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import PasswordField from '../components/PasswordField';

export default function Recover() {
    const navigate = useNavigate();

    const [identifier, setIdentifier] = useState('');
    const [recoveryCode, setRecoveryCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (newPassword !== confirm) {
            setError('Passwords do not match');
            return;
        }
        setBusy(true);
        try {
            await api.post('/api/auth/recover', { identifier, recoveryCode, newPassword });
            navigate('/login', { state: { recovered: true } });
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Recovery failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="stack">
            <div className="page-head">
                <h1>Recover Account</h1>
                <p className="sub">
                    Enter the recovery code you saved when you created your profile.
                    Recovery always returns you to the same account — it never creates a duplicate.
                </p>
            </div>

            <form className="card panel form" onSubmit={submit}>
                <div className="field">
                    <label htmlFor="identifier">Username / User ID</label>
                    <input id="identifier" className="input mono" value={identifier}
                        onChange={e => setIdentifier(e.target.value)} maxLength={64} required />
                </div>

                <div className="field">
                    <label htmlFor="recoveryCode">Recovery Code</label>
                    <input id="recoveryCode" className="input mono" value={recoveryCode}
                        onChange={e => setRecoveryCode(e.target.value)} maxLength={32} required
                        placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" />
                </div>

                <PasswordField id="newPassword" label="New Password" value={newPassword} onChange={setNewPassword} />
                <PasswordField id="confirm" label="Confirm New Password" value={confirm} onChange={setConfirm} />

                {error && <div className="form-error" role="alert">{error}</div>}

                <button className="btn btn-primary btn-block" disabled={busy}>
                    {busy ? 'Verifying…' : 'Reset Password'}
                </button>

                <p className="muted center">
                    Remembered it? <Link to="/login">Back to login</Link>
                </p>
            </form>
        </div>
    );
}
