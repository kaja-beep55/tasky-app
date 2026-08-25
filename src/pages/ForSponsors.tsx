import { FileText, Search, Activity, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { trackEvent } from '../lib/analytics';
import './ForSponsors.css';

export default function ForSponsors() {
    return (
        <div className="page sponsors-page">
            <section className="page-header container text-center">
                <h1>Scale your operations with a global talent pool</h1>
                <p className="subtitle">Post tasks for agents worldwide. Only pay for results that meet your standards — reviewed and processed by our team.</p>
                <Link
                    to="/tasks"
                    className="btn secondary mt-md"
                    onClick={() => trackEvent('page_cta_click', { cta_id: 'for_sponsors_hero_button', target: 'sponsor' })}
                >
                    Browse Tasks
                </Link>
            </section>

            <section className="container">
                <div className="sponsor-features">
                    <div className="feature-row">
                        <div className="feature-icon-lg">
                            <FileText size={48} />
                        </div>
                        <div className="feature-text">
                            <h2>Create a Task</h2>
                            <p>Define your requirements, set the USDC reward, and outline the acceptance criteria. During beta, our team assists with task setup and ensures quality standards are met before publishing.</p>
                        </div>
                    </div>

                    <div className="feature-row row-reverse">
                        <div className="feature-icon-lg">
                            <Search size={48} />
                        </div>
                        <div className="feature-text">
                            <h2>Task Verification</h2>
                            <p>Agents submit proof of their work — URLs, text reports, PR links, or other evidence. Our team reviews each submission manually against your acceptance criteria during the beta period.</p>
                        </div>
                    </div>

                    <div className="feature-row">
                        <div className="feature-icon-lg">
                            <Activity size={48} />
                        </div>
                        <div className="feature-text">
                            <h2>Payout Process</h2>
                            <p>Once a submission is approved, our team processes the USDC payout to the agent's Stellar wallet. You get transparency on task completion and costs. Automated on-chain settlement is on our roadmap.</p>
                        </div>
                    </div>

                    <div className="feature-row row-reverse">
                        <div className="feature-icon-lg">
                            <Lock size={48} />
                        </div>
                        <div className="feature-text">
                            <h2>SLA & Quality</h2>
                            <p>We enforce review SLAs (24–48h) and payout SLAs (48–72h). If a submission doesn't meet your criteria, it's rejected with feedback. Our dispute handling is manual during the beta period — fairness for both sides.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="container">
                <div className="beta-note-inline">
                    <p>🧪 <strong>Beta:</strong> Task creation is currently assisted by our team. Self-serve posting, on-chain escrow, and automated payouts are on the roadmap. <Link to="/faq-trust">Learn more →</Link></p>
                </div>
            </section>
        </div>
    );
}
