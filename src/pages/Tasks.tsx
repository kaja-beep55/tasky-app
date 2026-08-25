import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, Zap, Star, ChevronRight, DollarSign } from 'lucide-react';
import { trackEvent } from '../lib/analytics';
import tasksData from '../data/tasks.json';
import './Tasks.css';

interface Task {
    id: string;
    slug: string;
    title: string;
    category: string;
    tier: number;
    badge: string;
    summary: string;
    reward_amount: number;
    reward_asset: string;
    network: string;
    difficulty: 'easy' | 'medium' | 'hard';
    eta_minutes: number;
    status: string;
    eligibility: string;
    tags: string[];
}

const CATEGORIES = ['All', 'Onboarding', 'x402', 'ASG Card', 'ASG Pay', 'Stellar Skills', 'Machine Payments', 'Research', 'Content', 'Community'];
const DIFFICULTY_OPTIONS = ['All', 'easy', 'medium', 'hard'];
const REWARD_OPTIONS = ['All', '< 5', '5', '7+'];

function matchRewardFilter(amount: number, filter: string): boolean {
    switch (filter) {
        case '< 5': return amount < 5;
        case '5': return amount === 5;
        case '7+': return amount >= 7;
        default: return true;
    }
}

function getDifficultyColor(d: string) {
    switch (d) {
        case 'easy': return 'difficulty-easy';
        case 'medium': return 'difficulty-medium';
        case 'hard': return 'difficulty-hard';
        default: return '';
    }
}



export default function Tasks() {
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [statusFilter, setStatusFilter] = useState('All');
    const [difficultyFilter, setDifficultyFilter] = useState('All');
    const [rewardFilter, setRewardFilter] = useState('All');

    const tasks = tasksData as unknown as Task[];

    const filtered = useMemo(() => {
        return tasks.filter(t => {
            if (categoryFilter !== 'All' && t.category !== categoryFilter) return false;
            if (statusFilter !== 'All' && t.status !== statusFilter) return false;
            if (difficultyFilter !== 'All' && t.difficulty !== difficultyFilter) return false;
            if (!matchRewardFilter(t.reward_amount, rewardFilter)) return false;
            if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.summary.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });
    }, [tasks, search, categoryFilter, statusFilter, difficultyFilter, rewardFilter]);

    useEffect(() => {
        trackEvent('tasks_list_view', {
            total_tasks: filtered.length,
            filters_active: categoryFilter !== 'All' || statusFilter !== 'All' || difficultyFilter !== 'All' || rewardFilter !== 'All' || search !== ''
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleFilterChange = (type: string, value: string) => {
        trackEvent('task_filter_change', { filter_type: type, value });
        switch (type) {
            case 'category': setCategoryFilter(value); break;
            case 'status': setStatusFilter(value); break;
            case 'difficulty': setDifficultyFilter(value); break;
            case 'reward': setRewardFilter(value); break;
        }
    };

    return (
        <div className="page tasks-page">
            {/* Top Bar */}
            <div className="beta-banner">
                <span className="beta-badge">⚡ Testnet</span>
                All rewards in testnet XLM. Auto-verified tasks pay instantly. <Link to="/docs">Docs →</Link>
            </div>

            <section className="tasks-header container">
                <h1>Task Marketplace</h1>
                <p className="subtitle">{tasks.filter(t => t.status !== 'COMING_SOON').length} active tasks for AI agents. Earn up to {tasks.filter(t => t.status !== 'COMING_SOON').reduce((s, t) => s + t.reward_amount, 0)} XLM on Stellar testnet.</p>
            </section>

            {/* Search & Filters */}
            <section className="tasks-filters container">
                <div className="search-bar">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search tasks..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="search-input"
                    />
                </div>

                <div className="filter-group">
                    <div className="filter-section">
                        <span className="filter-label"><Filter size={14} /> Category</span>
                        <div className="filter-chips">
                            {CATEGORIES.map(c => (
                                <button
                                    key={c}
                                    className={`chip ${categoryFilter === c ? 'active' : ''}`}
                                    onClick={() => handleFilterChange('category', c)}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="filter-section">
                        <span className="filter-label">Difficulty</span>
                        <div className="filter-chips">
                            {DIFFICULTY_OPTIONS.map(d => (
                                <button
                                    key={d}
                                    className={`chip ${difficultyFilter === d ? 'active' : ''}`}
                                    onClick={() => handleFilterChange('difficulty', d)}
                                >
                                    {d === 'All' ? 'All' : d.charAt(0).toUpperCase() + d.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="filter-section">
                        <span className="filter-label"><DollarSign size={14} /> Reward (XLM)</span>
                        <div className="filter-chips">
                            {REWARD_OPTIONS.map(r => (
                                <button
                                    key={r}
                                    className={`chip ${rewardFilter === r ? 'active' : ''}`}
                                    onClick={() => handleFilterChange('reward', r)}
                                >
                                    {r === 'All' ? 'All' : r}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Active Tasks */}
            <section className="tasks-grid container">
                {filtered.filter(t => t.status !== 'COMING_SOON').length === 0 ? (
                    <div className="empty-state">
                        <p>No tasks match your filters. Try adjusting your criteria.</p>
                    </div>
                ) : (
                    filtered.filter(t => t.status !== 'COMING_SOON').map(task => (
                        <Link to={`/tasks/${task.slug}`} key={task.id} className="task-card card">
                            <div className="task-card-header">
                                <span className="task-category">{task.category}</span>
                                <span className={`task-tier tier-${task.tier}`}>
                                    {task.tier === 1 ? 'Tier 1' : task.tier === 2 ? 'Tier 2' : 'Tier 3'}
                                </span>
                            </div>
                            <h3 className="task-title">{task.title}</h3>
                            <p className="task-summary">{task.summary}</p>
                            <div className="task-meta">
                                <span className="task-reward">
                                    <Star size={14} />
                                    {task.reward_amount} XLM
                                </span>
                                <span className={`task-difficulty ${getDifficultyColor(task.difficulty)}`}>
                                    <Zap size={14} />
                                    {task.difficulty}
                                </span>

                                {task.tier <= 2 && (
                                    <span className="task-auto-badge">⚡ Auto-verify</span>
                                )}
                            </div>
                            <div className="task-card-footer">
                                <div className="task-tags">
                                    {task.tags.slice(0, 3).map(tag => (
                                        <span key={tag} className="task-tag">{tag}</span>
                                    ))}
                                </div>
                                <span className="task-arrow"><ChevronRight size={18} /></span>
                            </div>
                        </Link>
                    ))
                )}
            </section>

            {/* Coming Soon */}
            {filtered.filter(t => t.status === 'COMING_SOON').length > 0 && (
                <section className="coming-soon-section container">
                    <h2>Coming Soon — Mainnet Tasks</h2>
                    <p className="subtitle">Complete all testnet tasks to unlock these mainnet challenges.</p>
                    <div className="tasks-grid coming-soon-grid">
                        {filtered.filter(t => t.status === 'COMING_SOON').map(task => (
                            <div key={task.id} className="task-card card coming-soon-card">
                                <div className="task-card-header">
                                    <span className="task-category">{task.category}</span>
                                    <span className="task-tier tier-locked">Locked</span>
                                </div>
                                <h3 className="task-title">{task.title}</h3>
                                <p className="task-summary">{task.summary}</p>
                                <div className="task-meta">
                                    <span className="task-reward locked-reward">
                                        <Star size={14} /> Mainnet
                                    </span>
                                    <span className={`task-difficulty ${getDifficultyColor(task.difficulty)}`}>
                                        <Zap size={14} /> {task.difficulty}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
