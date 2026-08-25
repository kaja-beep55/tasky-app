import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { actionLabel, formatDateTime } from '../lib/format';
import type { CoinTransaction } from '../lib/types';
import { CoinPill } from '../components/Coin';

function badgeClass(actionType: string): string {
    if (actionType === 'task_reward' || actionType === 'admin_add') return 'add';
    if (actionType === 'admin_deduct') return 'deduct';
    return 'reset';
}

export default function CoinHistory() {
    const [data, setData] = useState<{ transactions: CoinTransaction[]; balance: number } | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get<{ transactions: CoinTransaction[]; balance: number }>('/api/coins/history')
            .then(setData)
            .catch(e => setError(e.message));
    }, []);

    if (error) {
        return (
            <div className="stack">
                <div className="form-error">{error}</div>
                <p className="muted center">You need to <Link to="/login">log in</Link> to view coin history.</p>
            </div>
        );
    }

    if (!data) {
        return <div className="loading-block"><span className="spinner" aria-label="Loading history" /></div>;
    }

    return (
        <div className="stack">
            <Link to="/profile" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
                <ArrowLeft size={16} /> Back to profile
            </Link>

            <div className="page-head">
                <h1>Coin History</h1>
                <p className="sub">Current balance</p>
                <CoinPill amount={data.balance} />
            </div>

            <div className="card">
                {data.transactions.length === 0 && (
                    <div className="empty-state">
                        <p>No coin activity yet. Complete a task to earn your first coins.</p>
                    </div>
                )}
                {data.transactions.map(txn => (
                    <div className="txn-row" key={txn.id}>
                        <span className={`txn-badge ${badgeClass(txn.actionType)}`}>
                            {actionLabel(txn.actionType)}
                        </span>
                        <span className="txn-info">
                            <span className="reason">{txn.reason}</span>
                            <span className="when">{formatDateTime(txn.createdAt)}</span>
                        </span>
                        <span className="txn-amounts">
                            <span className={`delta ${txn.amount >= 0 ? 'pos' : 'neg'}`}>
                                {txn.actionType === 'admin_reset' ? 'RESET' : `${txn.amount >= 0 ? '+' : ''}${txn.amount}`}
                            </span>
                            <span className="balance-flow" style={{ display: 'block' }}>
                                {txn.previousBalance} → {txn.newBalance}
                            </span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
