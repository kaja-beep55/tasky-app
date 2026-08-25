import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { Task } from '../../lib/types';

interface Props {
    existing?: Task;          // when present → edit mode
    onSaved: () => void;
    onCancel?: () => void;
}

export default function AdminTaskForm({ existing, onSaved, onCancel }: Props) {
    const [form, setForm] = useState({
        taskNumber: existing?.taskNumber ?? '',
        title: existing?.title ?? '',
        imageUrl: existing?.imageUrl ?? '',
        rewardCoins: existing ? String(existing.rewardCoins) : '',
        targetUrl: existing?.targetUrl ?? '',
        description: existing?.description ?? '',
        whatToDo: existing?.whatToDo ?? '',
        rules: existing?.rules ?? '',
        status: existing?.status ?? 'published',
    });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm(f => ({ ...f, [key]: e.target.value }));

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            const payload = {
                ...form,
                rewardCoins: parseInt(form.rewardCoins, 10),
            };
            if (existing) {
                // taskNumber is the identity — it is not editable.
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { taskNumber, ...patch } = payload;
                await api.patch(`/api/admin/tasks/${encodeURIComponent(existing.taskNumber)}`, patch);
            } else {
                await api.post('/api/admin/tasks', payload);
            }
            onSaved();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Save failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form className="card panel form" onSubmit={submit}>
            <h3 style={{ fontSize: '1rem' }}>{existing ? `Edit Task #${existing.taskNumber}` : 'Add Task'}</h3>

            <div className="field">
                <label htmlFor="f-taskNumber">Task Number (unique)</label>
                <input id="f-taskNumber" className="input mono" value={form.taskNumber}
                    onChange={set('taskNumber')} required disabled={!!existing} maxLength={32} />
            </div>
            <div className="field">
                <label htmlFor="f-title">Task Title</label>
                <input id="f-title" className="input" value={form.title} onChange={set('title')} required maxLength={120} />
            </div>
            <div className="field">
                <label htmlFor="f-image">Image URL (https or /task-images/…)</label>
                <input id="f-image" className="input mono" value={form.imageUrl} onChange={set('imageUrl')} required maxLength={2048} />
            </div>
            <div className="field">
                <label htmlFor="f-reward">Reward Coins</label>
                <input id="f-reward" className="input mono" type="number" min={1} max={1000000}
                    value={form.rewardCoins} onChange={set('rewardCoins')} required />
            </div>
            <div className="field">
                <label htmlFor="f-url">Target URL</label>
                <input id="f-url" className="input mono" type="url" value={form.targetUrl} onChange={set('targetUrl')} required maxLength={2048} />
            </div>
            <div className="field">
                <label htmlFor="f-desc">Description</label>
                <textarea id="f-desc" className="input" value={form.description} onChange={set('description')} required maxLength={4000} />
            </div>
            <div className="field">
                <label htmlFor="f-what">What To Do</label>
                <textarea id="f-what" className="input" value={form.whatToDo} onChange={set('whatToDo')} required maxLength={4000} />
            </div>
            <div className="field">
                <label htmlFor="f-rules">Rules</label>
                <textarea id="f-rules" className="input" value={form.rules} onChange={set('rules')} maxLength={4000} />
            </div>
            <div className="field">
                <label htmlFor="f-status">Status</label>
                <select id="f-status" className="input" value={form.status} onChange={set('status')}>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                </select>
            </div>

            {error && <div className="form-error" role="alert">{error}</div>}

            <div className="search-row">
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
                    {busy ? 'Saving…' : existing ? 'Save Changes' : 'Create Task'}
                </button>
                {onCancel && (
                    <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
                )}
            </div>
        </form>
    );
}
