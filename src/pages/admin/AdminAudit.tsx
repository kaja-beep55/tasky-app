import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { AuditLog } from '../../lib/types';

export default function AdminAudit() {
    const [logs, setLogs] = useState<AuditLog[] | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get<{ logs: AuditLog[] }>('/api/admin/audit')
            .then(d => setLogs(d.logs))
            .catch(e => setError(e instanceof ApiError ? e.message : 'Failed to load audit log'));
    }, []);

    if (error) return <div className="form-error">{error}</div>;
    if (!logs) return <div className="loading-block"><span className="spinner" /></div>;

    return (
        <div className="card">
            {logs.length === 0 && <div className="empty-state"><p>No audit entries yet.</p></div>}
            {logs.map(log => (
                <div className="txn-row" key={log.id}>
                    <span className={`txn-badge ${log.actorType === 'admin' ? 'add' : log.actorType === 'system' ? 'reset' : 'deduct'}`}>
                        {log.actorType.slice(0, 4).toUpperCase()}
                    </span>
                    <span className="txn-info">
                        <span className="reason mono" style={{ fontSize: '0.8rem' }}>{log.action}</span>
                        <span className="when">{formatDateTime(log.createdAt)}</span>
                    </span>
                    <span className="muted mono" style={{ fontSize: '0.68rem' }}>
                        {log.targetType ? `${log.targetType}` : ''}
                    </span>
                </div>
            ))}
        </div>
    );
}
