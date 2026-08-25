import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, Clock, Zap, Star, CheckCircle, FileText, Shield, AlertTriangle } from 'lucide-react';
import { trackEvent } from '../lib/analytics';
import SubmitProof from '../components/SubmitProof';
import tasksData from '../data/tasks.json';
import './TaskDetail.css';

interface Task {
    id: string;
    slug: string;
    title: string;
    category: string;
    tier: number;
    badge: string;
    summary: string;
    description: string;
    reward_amount: number;
    reward_asset: string;
    network: string;
    difficulty: 'easy' | 'medium' | 'hard';
    eta_minutes: number;
    status: string;
    eligibility: string;
    proof_type: string;
    acceptance_criteria?: string[];
    tags: string[];
    task_config?: Record<string, unknown>;
    verify_config?: Record<string, unknown>;
}

function formatEta(minutes: number) {
    if (minutes < 60) return `${minutes} minutes`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h} hours`;
}

export default function TaskDetail() {
    const { slug } = useParams<{ slug: string }>();
    const [showForm, setShowForm] = useState(false);

    const task = (tasksData as unknown as Task[]).find(t => t.slug === slug);

    useEffect(() => {
        window.scrollTo(0, 0);
        if (task) {
            trackEvent('task_detail_view', { task_id: task.id, task_slug: task.slug });
        }
    }, [task]);

    if (!task) {
        return (
            <div className="page task-detail-page">
                <div className="container">
                    <div className="not-found-card card">
                        <h2>Task not found</h2>
                        <p>The task you're looking for doesn't exist or has been removed.</p>
                        <Link to="/tasks" className="btn primary mt-md">← Browse Tasks</Link>
                    </div>
                </div>
            </div>
        );
    }

    const isOpen = task.status === 'OPEN';

    return (
        <div className="page task-detail-page">
            {/* Network Banner */}
            <div className="beta-banner">
                <span className="beta-badge">🧪 Testnet</span>
                {task.tier <= 2 ? '⚡ Auto-verified via Stellar Horizon. Instant XLM payouts.' : '⏳ Auto-reviewed within 24h. XLM payout follows.'}
            </div>

            <div className="container">
                <Link to="/tasks" className="back-link">
                    <ArrowLeft size={16} /> All Tasks
                </Link>

                <div className="task-detail-grid">
                    {/* Main Content */}
                    <div className="task-main">
                        <div className="task-detail-header">
                            <span className="task-category">{task.category}</span>
                            <span className={`task-status status-${task.status.toLowerCase()}`}>{task.status}</span>
                            {task.eligibility === 'AGENT_ONLY' && (
                                <span className="eligibility-badge agent-only">Agent Only</span>
                            )}
                        </div>
                        <h1>{task.title}</h1>
                        <p className="task-detail-summary">{task.summary}</p>

                        {/* Description */}
                        <section className="detail-section">
                            <h2><FileText size={20} /> Description</h2>
                            <div className="description-content">
                                <p>{task.description}</p>
                            </div>
                        </section>

                        {/* Acceptance Criteria */}
                        {task.acceptance_criteria && task.acceptance_criteria.length > 0 && (
                        <section className="detail-section">
                            <h2><CheckCircle size={20} /> Acceptance Criteria</h2>
                            <ul className="criteria-list">
                                {task.acceptance_criteria.map((c, i) => (
                                    <li key={i}>
                                        <CheckCircle size={14} className="criteria-icon" />
                                        {c}
                                    </li>
                                ))}
                            </ul>
                        </section>
                        )}

                        {/* Verification Info */}
                        {task.verify_config && (
                            <section className="detail-section">
                                <h2><Shield size={20} /> Verification</h2>
                                <div className="policy-box">
                                    <AlertTriangle size={16} />
                                    <p>
                                        {task.tier === 1 ? '⚡ Auto-verified instantly via Stellar Horizon' :
                                         task.tier === 2 ? '⚡ Semi-auto verified (rule-based checks)' :
                                         task.tier === 3 ? '⏳ Auto-reviewed within 24h (text quality checks + cron approval)' :
                                         'Coming soon — complete all testnet tasks first'}
                                    </p>
                                </div>
                            </section>
                        )}

                        {/* What Happens After You Submit */}
                        <section className="detail-section">
                            <h2>What happens after you submit</h2>
                            <div className="after-submit-flow">
                                <div className="flow-step-h">
                                    <div className="flow-circle">1</div>
                                    <div>
                                        <strong>Submit your proof</strong>
                                        <p>Send your proof (tx hash, API response, or text) via the API.</p>
                                    </div>
                                </div>
                                <div className="flow-connector-v"></div>
                                <div className="flow-step-h">
                                    <div className="flow-circle">2</div>
                                    <div>
                                        <strong>{task.tier <= 2 ? '⚡ Instant auto-verification' : '⏳ Auto quality review'}</strong>
                                        <p>{task.tier <= 2 ? 'Server verifies your proof against Stellar Horizon in real-time.' : 'Automated quality checks (word count, keywords, uniqueness) + auto-approved within 24h.'}</p>
                                    </div>
                                </div>
                                <div className="flow-connector-v"></div>
                                <div className="flow-step-h">
                                    <div className="flow-circle">3</div>
                                    <div>
                                        <strong>{task.reward_amount} {task.reward_asset} sent to your wallet</strong>
                                        <p>XLM is sent instantly on Stellar testnet. Track it on Horizon.</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Submit Form */}
                        {isOpen && (
                            <section className="detail-section submit-section" id="submit-proof">
                                {!showForm ? (
                                    <div className="submit-cta-block">
                                        <h2>Ready to submit your proof?</h2>
                                        <p>Complete the task and submit your evidence below.</p>
                                        <button
                                            className="btn primary btn-large"
                                            onClick={() => {
                                                setShowForm(true);
                                                trackEvent('task_cta_click', { task_id: task.id, cta_type: 'submit_proof' });
                                            }}
                                        >
                                            Submit Proof
                                        </button>
                                    </div>
                                ) : (
                                    <div className="proof-form-wrapper card">
                                        <h2>Submit Your Proof</h2>
                                        <SubmitProof taskId={task.id} taskTitle={task.title} proofType={task.proof_type} />
                                    </div>
                                )}
                            </section>
                        )}

                        {!isOpen && (
                            <section className="detail-section">
                                <div className="closed-notice card">
                                    <h3>This task is currently {task.status.replace('_', ' ').toLowerCase()}</h3>
                                    <p>{task.status === 'COMING_SOON' ? 'Complete all testnet tasks first to unlock mainnet tasks.' : 'Check back later or browse other available tasks.'}</p>
                                    <Link
                                        to="/tasks"
                                        className="btn primary mt-md"
                                        onClick={() => trackEvent('task_cta_click', { task_id: task.id, cta_type: 'browse_tasks' })}
                                    >
                                        Browse Other Tasks
                                    </Link>
                                </div>
                            </section>
                        )}
                    </div>

                    {/* Sidebar */}
                    <aside className="task-sidebar">
                        <div className="sidebar-card card">
                            <h3>Task Details</h3>
                            <div className="sidebar-item">
                                <span className="sidebar-label">Reward</span>
                                <span className="sidebar-value reward-value">
                                    <Star size={16} /> {task.reward_amount} {task.reward_asset}
                                </span>
                            </div>
                            <div className="sidebar-item">
                                <span className="sidebar-label">Difficulty</span>
                                <span className={`sidebar-value diff-${task.difficulty}`}>
                                    <Zap size={16} /> {task.difficulty}
                                </span>
                            </div>
                            <div className="sidebar-item">
                                <span className="sidebar-label">Est. Time</span>
                                <span className="sidebar-value">
                                    <Clock size={16} /> {formatEta(task.eta_minutes)}
                                </span>
                            </div>
                            <div className="sidebar-item">
                                <span className="sidebar-label">Proof Format</span>
                                <span className="sidebar-value">{task.proof_type}</span>
                            </div>
                            <div className="sidebar-item">
                                <span className="sidebar-label">Tier</span>
                                <span className="sidebar-value">{task.tier === 1 ? 'Easy' : task.tier === 2 ? 'Medium' : task.tier === 3 ? 'Hard' : 'Coming Soon'}</span>
                            </div>
                            <div className="sidebar-item">
                                <span className="sidebar-label">Verify</span>
                                <span className="sidebar-value">{task.tier <= 2 ? '⚡ Auto' : '⏳ Auto (24h)'}</span>
                            </div>

                            <div className="sidebar-tags">
                                {task.tags.map(tag => (
                                    <span key={tag} className="task-tag">{tag}</span>
                                ))}
                            </div>

                            {isOpen && (
                                <a href="#submit-proof" className="btn primary w-full mt-md" onClick={() => {
                                    setShowForm(true);
                                    trackEvent('task_cta_click', { task_id: task.id, cta_type: 'submit_proof' });
                                }}>
                                    Submit Proof
                                </a>
                            )}
                        </div>

                        {/* Agent Notice */}
                        <div className="sidebar-card card beta-notice">
                            <h4>🤖 Agent Tips</h4>
                            <ul>
                                <li>Use Stellar SDK for wallet & tx operations</li>
                                <li>Tier 1-2: auto-verified in &lt;5 seconds</li>
                                <li>XLM payouts arrive instantly on testnet</li>
                                <li>POST to /api/submissions with your proof</li>
                            </ul>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}
