import { useState } from 'react';
import { Search } from 'lucide-react';
import { api, ApiError, newIdempotencyKey } from '../../lib/api';
import type { CoinTransaction, Profile } from '../../lib/types';
import { CoinDisc, CoinPill } from '../../components/Coin';

type CoinAction = 'add' | 'deduct' | 'reset';

export default function AdminCoins() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Profile[] | null>(null);
    const [selected, setSelected] = useState<Profile | null>(null);
    const [action, setAction] = useState<CoinAction>('add');
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    // One key per user selection — retries reuse it, never double-apply.
    const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey());

    const search = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSelected(null);
        try {
            const data = await api.get<{ profiles: Profile[] }>(`/api/admin/users?query=${encodeURIComponent(query)}`);
            setResults(data.profiles);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Search failed');
        }
    };

    const pick = (p: Profile) => {
        setSelected(p);
        setIdempotencyKey(newIdempotencyKey());
        setNotice('');
        setError('');
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selected) return;
        setError('');
        setNotice('');
        setBusy(true);
        try {
            const data = await api.post<{ transaction: CoinTransaction; applied: boolean }>('/api/admin/coins', {
                userId: selected.id,
                action,
                amount: action === 'reset' ? undefined : parseInt(amount, 10),
                reason,
                idempotencyKey,
            });
            setNotice(
                data.applied
                    ? `Done. ${selected.name}'s balance: ${data.transaction.previousBalance} → ${data.transaction.newBalance}`
                    : 'This operation was already applied (idempotent retry).',
            );
            setSelected({ ...selected, coins: data.transaction.newBalance });
            setAmount('');
            setReason('');
            setIdempotencyKey(newIdempotencyKey());
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Operation failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="stack">
            <form className="search-row" onSubmit={search}>
                <input
                    className="input"
                    placeholder="Search user: number, ID, username, or name…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    aria-label="Search users"
                />
                <button className="btn btn-outline btn-sm" aria-label="Search">
                    <Search size={16} />
                </button>
            </form>

            {error && <div className="form-error">{error}</div>}

            {results && !selected && (
                results.length === 0 ? (
                    <div className="card empty-state"><p>No users found.</p></div>
                ) : (
                    results.map(p => (
                        <button key={p.id} className="card result-card" style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line)' }} onClick={() => pick(p)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong>{p.name}</strong>
                                <span className={`status-tag ${p.status}`}>{p.status}</span>
                            </div>
                            <div className="kv-grid">
                                <div className="kv"><span className="k">User No.</span><span className="v mono">{p.userNumber}</span></div>
                                <div className="kv"><span className="k">Username</span><span className="v mono">@{p.username}</span></div>
                                <div className="kv"><span className="k">Country</span><span className="v">{p.country}</span></div>
                                <div className="kv"><span className="k">State</span><span className="v">{p.state}</span></div>
                            </div>
                            <CoinPill amount={p.coins} />
                        </button>
                    ))
                )
            )}

            {selected && (
                <form className="card panel form" onSubmit={submit}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <strong>{selected.name}</strong>
                            <span className="muted mono" style={{ display: 'block', fontSize: '0.75rem' }}>
                                #{selected.userNumber} · @{selected.username}
                            </span>
                        </div>
                        <CoinPill amount={selected.coins} />
                    </div>

                    <div className="admin-tabs">
                        {(['add', 'deduct', 'reset'] as CoinAction[]).map(a => (
                            <button type="button" key={a}
                                className={`admin-tab ${action === a ? 'active' : ''}`}
                                onClick={() => setAction(a)}>
                                {a === 'add' ? 'Add Coins' : a === 'deduct' ? 'Deduct Coins' : 'Reset Coins'}
                            </button>
                        ))}
                    </div>

                    {action !== 'reset' && (
                        <div className="field">
                            <label htmlFor="amount">Amount</label>
                            <input id="amount" className="input mono" type="number" min={1} max={1000000}
                                value={amount} onChange={e => setAmount(e.target.value)} required />
                        </div>
                    )}

                    <div className="field">
                        <label htmlFor="reason">Reason</label>
                        <input id="reason" className="input" value={reason} maxLength={300}
                            onChange={e => setReason(e.target.value)} required
                            placeholder={action === 'add' ? 'e.g. Task 3 verified' : action === 'deduct' ? 'e.g. Admin adjustment' : 'e.g. Admin reset'} />
                    </div>

                    {notice && <div className="form-success">{notice}</div>}

                    <div className="search-row">
                        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
                            <CoinDisc />
                            {busy ? 'Applying…' : action === 'add' ? 'Add Coins' : action === 'deduct' ? 'Deduct Coins' : 'Reset to 0'}
                        </button>
                        <button type="button" className="btn btn-outline" onClick={() => setSelected(null)}>
                            Back
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
