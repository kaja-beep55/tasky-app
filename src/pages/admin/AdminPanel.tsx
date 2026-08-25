import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import AdminTasks from './AdminTasks';
import AdminTaskForm from './AdminTaskForm';
import AdminCoins from './AdminCoins';
import AdminSubmissions from './AdminSubmissions';
import AdminAudit from './AdminAudit';

type Tab = 'tasks' | 'add' | 'coins' | 'submissions' | 'audit';

const TABS: { id: Tab; label: string }[] = [
    { id: 'tasks', label: 'Task Details' },
    { id: 'add', label: 'Add Task' },
    { id: 'coins', label: 'Add Coins' },
    { id: 'submissions', label: 'Submissions' },
    { id: 'audit', label: 'Audit' },
];

export default function AdminPanel() {
    const navigate = useNavigate();
    const [tab, setTab] = useState<Tab>('tasks');
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        // Probe an admin endpoint — the httpOnly cookie does the talking.
        api.get('/api/admin/tasks')
            .catch((err) => {
                if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
                    navigate('/admin', { replace: true });
                }
            })
            .finally(() => setChecking(false));
    }, [navigate]);

    const lock = async () => {
        try {
            await api.post('/api/admin/lock');
        } finally {
            navigate('/admin');
        }
    };

    if (checking) {
        return <div className="loading-block"><span className="spinner" aria-label="Checking admin session" /></div>;
    }

    return (
        <div className="stack">
            <div className="section-head">
                <h2>Admin Panel</h2>
                <button className="btn btn-danger btn-sm" onClick={lock}>
                    <Lock size={14} /> Lock
                </button>
            </div>

            <div className="admin-tabs" role="tablist">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        role="tab"
                        aria-selected={tab === t.id}
                        className={`admin-tab ${tab === t.id ? 'active' : ''}`}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'tasks' && <AdminTasks />}
            {tab === 'add' && (
                <AdminTaskForm
                    onSaved={() => setTab('tasks')}
                />
            )}
            {tab === 'coins' && <AdminCoins />}
            {tab === 'submissions' && <AdminSubmissions />}
            {tab === 'audit' && <AdminAudit />}
        </div>
    );
}
