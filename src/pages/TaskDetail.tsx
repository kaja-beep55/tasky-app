import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, MessageCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { buildWhatsAppUrl } from '../lib/whatsapp';
import type { Task } from '../lib/types';
import { CoinDisc } from '../components/Coin';

export default function TaskDetail() {
    const { taskNumber } = useParams<{ taskNumber: string }>();
    const { profile } = useAuth();
    const [task, setTask] = useState<Task | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        if (!taskNumber) return;
        api.get<{ task: Task }>(`/api/tasks/${encodeURIComponent(taskNumber)}`)
            .then(d => setTask(d.task))
            .catch(e => setError(e.message));
    }, [taskNumber]);

    const handleWhatsApp = async () => {
        if (!task) return;
        // Register a pending submission (metadata only) if logged in.
        // Failure never blocks the WhatsApp flow.
        if (profile) {
            try {
                const res = await api.post<{ alreadySubmitted: boolean }>('/api/submissions', {
                    taskNumber: task.taskNumber,
                });
                setNotice(res.alreadySubmitted
                    ? 'You already submitted this task. Send your video on WhatsApp.'
                    : 'Submission registered. Now send your proof video on WhatsApp.');
            } catch {
                // never block the WhatsApp handoff
            }
        }
        window.open(buildWhatsAppUrl(task.taskNumber, task.title), '_blank', 'noopener,noreferrer');
    };

    if (error) {
        return (
            <div className="stack">
                <Link to="/" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
                    <ArrowLeft size={16} /> Back to tasks
                </Link>
                <div className="form-error">{error}</div>
            </div>
        );
    }

    if (!task) {
        return <div className="loading-block"><span className="spinner" aria-label="Loading task" /></div>;
    }

    return (
        <div className="stack">
            <Link to="/" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
                <ArrowLeft size={16} /> Back to tasks
            </Link>

            <div className="detail-hero">
                <img src={task.imageUrl} alt={`Task ${task.taskNumber} illustration`} />
            </div>

            <div className="card detail-block">
                <span className="task-number-chip">Task #{task.taskNumber}</span>
                <h1 className="task-title" style={{ fontSize: '1.4rem' }}>{task.title}</h1>
                <span className="reward-tag" style={{ fontSize: '1rem' }}>
                    <CoinDisc /> +{task.rewardCoins} coins
                </span>
            </div>

            <div className="card detail-block">
                <h3>Description</h3>
                <p className="content">{task.description}</p>
            </div>

            <div className="card detail-block">
                <h3>What You Need To Do</h3>
                <p className="content">{task.whatToDo}</p>
            </div>

            {task.rules && (
                <div className="card detail-block">
                    <h3>Rules</h3>
                    <p className="content">{task.rules}</p>
                </div>
            )}

            <div className="detail-actions">
                <a
                    href={task.targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary btn-block"
                >
                    <ExternalLink size={17} /> Open Target
                </a>
                <button onClick={handleWhatsApp} className="btn btn-whatsapp btn-block">
                    <MessageCircle size={17} /> Send Video on WhatsApp
                </button>
                {notice && <div className="form-success">{notice}</div>}
                {!profile && (
                    <p className="muted center">
                        <Link to="/signup">Create a profile</Link> so admin can credit your coins after reviewing your video.
                    </p>
                )}
            </div>
        </div>
    );
}
