import { useCallback, useEffect, useState } from 'react';
import { Pencil, Search, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { Task } from '../../lib/types';
import { CoinDisc } from '../../components/Coin';
import AdminTaskForm from './AdminTaskForm';

export default function AdminTasks() {
    const [tasks, setTasks] = useState<Task[] | null>(null);
    const [query, setQuery] = useState('');
    const [error, setError] = useState('');
    const [editing, setEditing] = useState<Task | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);
    const [notice, setNotice] = useState('');

    const load = useCallback(async () => {
        try {
            const data = await api.get<{ tasks: Task[] }>('/api/admin/tasks');
            setTasks(data.tasks);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Failed to load tasks');
        }
    }, []);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state only after an awaited fetch
    useEffect(() => { void load(); }, [load]);

    const filtered = (tasks ?? []).filter(t => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return t.taskNumber.toLowerCase().includes(q) || t.title.toLowerCase().includes(q);
    });

    const doDelete = async (task: Task) => {
        try {
            await api.del(`/api/admin/tasks/${encodeURIComponent(task.taskNumber)}`);
            setConfirmDelete(null);
            setNotice(`Task #${task.taskNumber} archived.`);
            await load();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Delete failed');
        }
    };

    if (editing) {
        return (
            <AdminTaskForm
                existing={editing}
                onSaved={() => { setEditing(null); void load(); }}
                onCancel={() => setEditing(null)}
            />
        );
    }

    return (
        <div className="stack">
            <div className="search-row">
                <input
                    className="input"
                    placeholder="Search by task number or name…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    aria-label="Search tasks"
                />
                <span className="btn btn-outline btn-sm" style={{ pointerEvents: 'none' }}>
                    <Search size={16} />
                </span>
            </div>

            {notice && <div className="form-success">{notice}</div>}
            {error && <div className="form-error">{error}</div>}

            {!tasks && <div className="loading-block"><span className="spinner" /></div>}

            {filtered.map(task => (
                <div key={task.id} className="card result-card">
                    <div style={{ display: 'flex', gap: 12 }}>
                        <div className="task-thumb" style={{ width: 64, minHeight: 64 }}>
                            <img src={task.imageUrl} alt="" loading="lazy" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <span className="task-number-chip">Task #{task.taskNumber}</span>
                            <h3 className="task-title" style={{ fontSize: '0.98rem' }}>{task.title}</h3>
                            <span className="reward-tag"><CoinDisc /> +{task.rewardCoins}</span>
                        </div>
                        <span className={`status-tag ${task.status}`}>{task.status}</span>
                    </div>

                    <details>
                        <summary className="muted" style={{ cursor: 'pointer' }}>Full details</summary>
                        <div className="kv" style={{ marginTop: 8 }}>
                            <span className="k">URL</span>
                            <span className="v mono" style={{ fontSize: '0.78rem' }}>{task.targetUrl}</span>
                            <span className="k" style={{ marginTop: 6 }}>Description</span>
                            <span className="v" style={{ fontWeight: 400 }}>{task.description}</span>
                            <span className="k" style={{ marginTop: 6 }}>What To Do</span>
                            <span className="v" style={{ fontWeight: 400, whiteSpace: 'pre-line' }}>{task.whatToDo}</span>
                            {task.rules && (<>
                                <span className="k" style={{ marginTop: 6 }}>Rules</span>
                                <span className="v" style={{ fontWeight: 400 }}>{task.rules}</span>
                            </>)}
                        </div>
                    </details>

                    <div className="search-row">
                        <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => setEditing(task)}>
                            <Pencil size={14} /> Edit
                        </button>
                        <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => setConfirmDelete(task)}>
                            <Trash2 size={14} /> Delete
                        </button>
                    </div>
                </div>
            ))}

            {tasks && filtered.length === 0 && (
                <div className="card empty-state"><p>No tasks match your search.</p></div>
            )}

            {confirmDelete && (
                <div className="card panel" style={{ borderColor: 'var(--danger)' }}>
                    <h3 style={{ fontSize: '1rem' }}>Delete Task #{confirmDelete.taskNumber}?</h3>
                    <p className="muted">
                        The task will be archived and hidden from the home page.
                        Past submissions and coin history are preserved.
                    </p>
                    <div className="search-row">
                        <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => doDelete(confirmDelete)}>
                            Confirm Delete
                        </button>
                        <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setConfirmDelete(null)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
