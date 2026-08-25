import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { Submission } from '../../lib/types';

export default function AdminSubmissions() {
    const [submissions, setSubmissions] = useState<Submission[] | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busyId, setBusyId] = useState('');

    const load = useCallback(async () => {
        try {
            const data = await api.get<{ submissions: Submission[] }>('/api/admin/submissions');
            setSubmissions(data.submissions);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Failed to load submissions');
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const review = async (submission: Submission, decision: 'approve' | 'reject') => {
        setBusyId(submission.id);
        setError('');
        setNotice('');
        try {
            const rejectionReason = decision === 'reject'
                ? window.prompt('Reason for rejection (visible in records):') || ''
                : '';
            await api.post('/api/admin/submissions', {
                submissionId: submission.id,
                decision,
                rejectionReason,
            });
            setNotice(`Submission ${decision}d${decision === 'approve' ? ' — reward coins granted' : ''}.`);
            await load();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Review failed');
        } finally {
            setBusyId('');
        }
    };

    if (!submissions) {
        return error
            ? <div className="form-error">{error}</div>
            : <div className="loading-block"><span className="spinner" /></div>;
    }

    const pending = submissions.filter(s => s.status === 'pending');
    const reviewed = submissions.filter(s => s.status !== 'pending');

    return (
        <div className="stack">
            {notice && <div className="form-success">{notice}</div>}
            {error && <div className="form-error">{error}</div>}

            <div className="section-head"><h2>Pending ({pending.length})</h2></div>

            {pending.length === 0 && (
                <div className="card empty-state"><p>No pending submissions.</p></div>
            )}

            {pending.map(s => (
                <div key={s.id} className="card result-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>{s.task ? `Task #${s.task.taskNumber} — ${s.task.title}` : 'Task'}</strong>
                        <span className="status-tag pending">{s.status}</span>
                    </div>
                    <div className="kv-grid">
                        <div className="kv"><span className="k">User</span><span className="v">{s.user?.name ?? '—'}</span></div>
                        <div className="kv"><span className="k">Username</span><span className="v mono">@{s.user?.username ?? '—'}</span></div>
                        <div className="kv"><span className="k">User No.</span><span className="v mono">{s.user?.userNumber ?? '—'}</span></div>
                        <div className="kv"><span className="k">Submitted</span><span className="v" style={{ fontSize: '0.78rem' }}>{formatDateTime(s.submittedAt)}</span></div>
                    </div>
                    <p className="muted">Verify the proof video on WhatsApp, then approve to grant {s.task?.rewardCoins ?? '—'} coins.</p>
                    <div className="search-row">
                        <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                            disabled={busyId === s.id} onClick={() => review(s, 'approve')}>
                            <Check size={14} /> Approve (+{s.task?.rewardCoins ?? '?'})
                        </button>
                        <button className="btn btn-danger btn-sm" style={{ flex: 1 }}
                            disabled={busyId === s.id} onClick={() => review(s, 'reject')}>
                            <X size={14} /> Reject
                        </button>
                    </div>
                </div>
            ))}

            {reviewed.length > 0 && (
                <>
                    <div className="section-head"><h2>Reviewed</h2></div>
                    {reviewed.slice(0, 20).map(s => (
                        <div key={s.id} className="card result-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{s.user?.name ?? '—'} · {s.task ? `Task #${s.task.taskNumber}` : ''}</span>
                                <span className={`status-tag ${s.status}`}>{s.status}</span>
                            </div>
                            {s.rejectionReason && <p className="muted">Reason: {s.rejectionReason}</p>}
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
