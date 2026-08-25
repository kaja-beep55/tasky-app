import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Trophy, Zap, Target, Star, Calendar, Activity, ExternalLink } from 'lucide-react';
import './AgentProfile.css';

interface AgentProfile {
    agent: {
        id: string;
        name: string;
        wallet: string;
        created_at: string;
        days_active: number;
    };
    stats: {
        tasks_completed: number;
        total_earned: number;
        total_submissions: number;
        approved: number;
        rejected: number;
        success_rate: number;
        rank: number;
    };
    tier: { name: string; icon: string; stars: number; color: string };
    skills: { name: string; icon: string; color: string }[];
    badges: { id: string; name: string; icon: string; desc: string }[];
    recent_activity: {
        task_id: string;
        task_title: string;
        status: string;
        reward: number;
        date: string;
    }[];
}

export default function AgentProfilePage() {
    const { wallet } = useParams<{ wallet: string }>();
    const [profile, setProfile] = useState<AgentProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        window.scrollTo(0, 0);
        if (!wallet) return;
        fetch(`/api/agent?wallet=${wallet}`)
            .then(r => {
                if (!r.ok) throw new Error('Not found');
                return r.json();
            })
            .then(data => { setProfile(data); setLoading(false); })
            .catch(() => { setError('Agent not found'); setLoading(false); });
    }, [wallet]);

    const handleCopy = () => {
        if (wallet) {
            navigator.clipboard.writeText(wallet);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (loading) {
        return (
            <div className="page agent-profile-page">
                <div className="container">
                    <div className="profile-loading">
                        <div className="loading-pulse" />
                        <p>Loading agent profile...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error || !profile) {
        return (
            <div className="page agent-profile-page">
                <div className="container">
                    <div className="profile-error card">
                        <h2>Agent Not Found</h2>
                        <p>No agent registered with this wallet address.</p>
                        <Link to="/leaderboard" className="btn primary">← Back to Leaderboard</Link>
                    </div>
                </div>
            </div>
        );
    }

    const { agent, stats, tier, skills, badges, recent_activity } = profile;
    const shortWallet = `${agent.wallet.slice(0, 6)}...${agent.wallet.slice(-4)}`;
    const joinDate = new Date(agent.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return (
        <div className="page agent-profile-page">
            <div className="container">
                <Link to="/leaderboard" className="back-link">
                    <ArrowLeft size={16} /> Back to Leaderboard
                </Link>

                {/* ── HERO CARD ── */}
                <div className="profile-hero-card">
                    <div className="profile-hero-top">
                        <div className="profile-avatar" style={{ borderColor: tier.color }}>
                            <span className="avatar-letter">{agent.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="profile-identity">
                            <h1 className="profile-name">{agent.name}</h1>
                            <div className="profile-wallet-row">
                                <code className="profile-wallet">{shortWallet}</code>
                                <button className="copy-btn-sm" onClick={handleCopy} title="Copy wallet">
                                    {copied ? <Check size={12} /> : <Copy size={12} />}
                                </button>
                                <a
                                    href={`https://stellar.expert/explorer/testnet/account/${agent.wallet}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="explorer-link"
                                    title="View on Stellar Expert"
                                >
                                    <ExternalLink size={12} />
                                </a>
                            </div>
                        </div>
                        <div className="profile-tier-badge" style={{ background: `${tier.color}18`, borderColor: `${tier.color}40` }}>
                            <span className="tier-icon">{tier.icon}</span>
                            <span className="tier-name" style={{ color: tier.color }}>{tier.name}</span>
                            {tier.stars > 0 && (
                                <span className="tier-stars">
                                    {'★'.repeat(tier.stars)}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* ── STATS ROW ── */}
                    <div className="profile-stats-grid">
                        <div className="p-stat">
                            <Trophy size={16} className="p-stat-icon" />
                            <span className="p-stat-value">{stats.tasks_completed}</span>
                            <span className="p-stat-label">Tasks</span>
                        </div>
                        <div className="p-stat">
                            <Zap size={16} className="p-stat-icon earned" />
                            <span className="p-stat-value">{stats.total_earned}</span>
                            <span className="p-stat-label">XLM Earned</span>
                        </div>
                        <div className="p-stat">
                            <Target size={16} className="p-stat-icon success" />
                            <span className="p-stat-value">{stats.success_rate}%</span>
                            <span className="p-stat-label">Success</span>
                        </div>
                        <div className="p-stat">
                            <Star size={16} className="p-stat-icon rank" />
                            <span className="p-stat-value">#{stats.rank}</span>
                            <span className="p-stat-label">Rank</span>
                        </div>
                    </div>
                </div>

                {/* ── SKILLS ── */}
                {skills.length > 0 && (
                    <section className="profile-section">
                        <h2 className="section-title"><Zap size={18} /> Skills</h2>
                        <div className="skills-grid">
                            {skills.map(s => (
                                <div key={s.name} className="skill-pill" style={{ borderColor: `${s.color}40`, background: `${s.color}0a` }}>
                                    <span className="skill-icon">{s.icon}</span>
                                    <span className="skill-name">{s.name}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── BADGES ── */}
                {badges.length > 0 && (
                    <section className="profile-section">
                        <h2 className="section-title"><Star size={18} /> Badges</h2>
                        <div className="badges-grid">
                            {badges.map(b => (
                                <div key={b.id} className="badge-card">
                                    <span className="badge-icon">{b.icon}</span>
                                    <div className="badge-info">
                                        <span className="badge-name">{b.name}</span>
                                        <span className="badge-desc">{b.desc}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── RECENT ACTIVITY ── */}
                {recent_activity.length > 0 && (
                    <section className="profile-section">
                        <h2 className="section-title"><Activity size={18} /> Recent Activity</h2>
                        <div className="activity-list">
                            {recent_activity.map((a, i) => (
                                <div key={i} className="activity-row">
                                    <span className={`activity-status status-${a.status}`}>
                                        {a.status === 'approved' ? '✓' : a.status === 'rejected' ? '✗' : '…'}
                                    </span>
                                    <div className="activity-info">
                                        <span className="activity-title">{a.task_title}</span>
                                        <span className="activity-date">
                                            {new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                    </div>
                                    {a.status === 'approved' && a.reward && (
                                        <span className="activity-reward">+{a.reward} XLM</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── FOOTER META ── */}
                <div className="profile-meta">
                    <Calendar size={14} />
                    <span>Joined {joinDate} · {agent.days_active} days active</span>
                </div>
            </div>
        </div>
    );
}
