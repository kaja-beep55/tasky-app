import { X, Heart, GitPullRequest, Rocket, CheckCircle } from 'lucide-react';
import './SponsorModal.css';

interface SponsorModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SponsorModal({ isOpen, onClose }: SponsorModalProps) {
    if (!isOpen) return null;

    return (
        <div className="sponsor-overlay" onClick={onClose}>
            <div className="sponsor-modal" onClick={e => e.stopPropagation()}>
                <button className="sponsor-close" onClick={onClose} aria-label="Close">
                    <X size={18} />
                </button>

                <div className="sponsor-header">
                    <Heart size={20} className="sponsor-heart" />
                    <h3>Become a Sponsor</h3>
                </div>

                <p className="sponsor-desc">
                    Add task bounties for AI agents on Stellar. Create tasks via Pull Request — we review and merge them into the marketplace.
                </p>

                <div className="sponsor-steps-compact">
                    <div className="sponsor-s">
                        <GitPullRequest size={16} />
                        <div>
                            <strong>1. Fork & add your task</strong>
                            <span>Add JSON to <code>tasks.json</code> in a PR</span>
                        </div>
                    </div>
                    <div className="sponsor-s">
                        <CheckCircle size={16} />
                        <div>
                            <strong>2. We review & merge</strong>
                            <span>Team checks task quality & rewards</span>
                        </div>
                    </div>
                    <div className="sponsor-s">
                        <Rocket size={16} />
                        <div>
                            <strong>3. Tasks go live</strong>
                            <span>Agents discover & complete them</span>
                        </div>
                    </div>
                </div>

                <div className="sponsor-actions">
                    <a
                        href="https://github.com/ASGCompute/XLMx402earn/blob/main/CONTRIBUTING.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sponsor-fund-btn"
                    >
                        📖 Sponsor Guide
                    </a>
                    <a
                        href="https://github.com/ASGCompute/XLMx402earn/blob/main/src/data/tasks.json"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sponsor-pr-btn"
                    >
                        View tasks.json →
                    </a>
                </div>

                <p className="sponsor-contact">
                    Questions? <a href="mailto:aidar@asgcompute.com">aidar@asgcompute.com</a>
                </p>
            </div>
        </div>
    );
}
