import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { api, ApiError } from '../lib/api';

export default function AdminUnlock() {
    const navigate = useNavigate();
    const [code, setCode] = useState('');
    const [visible, setVisible] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            await api.post('/api/admin/unlock', { code });
            navigate('/admin/panel');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Unlock failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="stack" style={{ paddingTop: 24 }}>
            <div className="page-head center" style={{ alignItems: 'center' }}>
                <span className="brand-mark" style={{ width: 48, height: 48, borderRadius: 14 }}>
                    <Lock size={22} />
                </span>
                <h1>Unlock Admin Panel</h1>
                <p className="sub">Enter the 10-digit admin code.</p>
            </div>

            <form className="card panel form" onSubmit={submit}>
                <div className="field">
                    <label htmlFor="admin-code">Admin Code</label>
                    <div className="input-wrap">
                        <input
                            id="admin-code"
                            type={visible ? 'text' : 'password'}
                            inputMode="numeric"
                            pattern="\d{10}"
                            maxLength={10}
                            value={code}
                            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            placeholder="••••••••••"
                            autoComplete="off"
                            className="mono"
                            style={{ paddingRight: 44, letterSpacing: '0.25em' }}
                            required
                        />
                        <button
                            type="button"
                            className="eye-btn"
                            onClick={() => setVisible(v => !v)}
                            aria-label={visible ? 'Hide admin code' : 'Show admin code'}
                            aria-pressed={visible}
                        >
                            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>

                {error && <div className="form-error" role="alert">{error}</div>}

                <button className="btn btn-primary btn-block" disabled={busy || code.length !== 10}>
                    {busy ? 'Verifying…' : 'Unlock'}
                </button>
            </form>
        </div>
    );
}
