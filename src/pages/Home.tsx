import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { buildWhatsAppUrl } from '../lib/whatsapp';
import type { Task } from '../lib/types';
import { CoinDisc } from '../components/Coin';

export default function Home() {
    const { profile } = useAuth();
    const [tasks, setTasks] = useState<Task[] | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get<{ tasks: Task[] }>('/api/tasks')
            .then(d => setTasks(d.tasks))
            .catch(e => setError(e.message));
    }, []);

    return (
        <>
            {/* Profile box — create profile or greet the user */}
            {profile ? (
                <Link to="/profile" className="profile-banner">
                    <span className="avatar">{profile.name.charAt(0).toUpperCase()}</span>
                    <span className="who">
                        <span className="hello">Welcome back</span>
                        <span className="name">{profile.name}</span>
                    </span>
                    <span className="muted mono">@{profile.username}</span>
                </Link>
            ) : (
                <Link to="/signup" className="profile-banner">
                    <span className="avatar">+</span>
                    <span className="who">
                        <span className="hello">New here?</span>
                        <span className="name">Create Profile</span>
                    </span>
                    <span className="muted">→</span>
                </Link>
            )}

            {/* WhatsApp — always visible, never gated behind profile creation */}
            <div className="wa-strip">
                <span className="txt">
                    <strong>Submit proof on WhatsApp</strong>
                    Finish a task, record a short screen video, and send it to us on WhatsApp.
                </span>
                <a
                    className="btn btn-whatsapp btn-sm"
                    href={buildWhatsAppUrl('', 'Task submission')}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <MessageCircle size={16} />
                    WhatsApp
                </a>
            </div>

            <div className="section-head">
                <h2>Available Tasks</h2>
                <span className="hint">{tasks ? `${tasks.length} open` : ''}</span>
            </div>

            {error && <div className="form-error">{error}</div>}

            {!tasks && !error && (
                <div className="loading-block"><span className="spinner" aria-label="Loading tasks" /></div>
            )}

            {tasks && tasks.length === 0 && (
                <div className="card empty-state">
                    <p>No tasks available right now. Please check back soon.</p>
                </div>
            )}

            {tasks?.map(task => (
                <article key={task.id} className="card task-card">
                    <div className="task-thumb">
                        <img src={task.imageUrl} alt="" loading="lazy" />
                    </div>
                    <div className="task-card-body">
                        <span className="task-number-chip">Task #{task.taskNumber}</span>
                        <h3 className="task-title">{task.title}</h3>
                        <p className="task-desc">{task.description}</p>
                        <div className="task-card-foot">
                            <span className="reward-tag">
                                <CoinDisc />
                                +{task.rewardCoins}
                            </span>
                            <Link to={`/tasks/${task.taskNumber}`} className="btn btn-outline btn-sm">
                                Details
                            </Link>
                        </div>
                    </div>
                </article>
            ))}
        </>
    );
}
