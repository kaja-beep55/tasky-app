import { useState } from 'react';
import { trackEvent, getSafeUTMs } from '../lib/analytics';

interface SubmitProofProps {
    taskId: string;
    taskTitle?: string;
    proofType: string;
}

type FormStatus = 'idle' | 'loading' | 'success' | 'error';

export default function SubmitProof({ taskId, proofType }: SubmitProofProps) {
    const [status, setStatus] = useState<FormStatus>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [resultData, setResultData] = useState<Record<string, unknown> | null>(null);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (status === 'loading') return;

        const form = e.currentTarget;
        const formData = new FormData(form);
        const data: Record<string, string> = {};
        formData.forEach((value, key) => {
            data[key] = String(value);
        });

        // Honeypot check
        if (data.website_url) {
            setStatus('success');
            return;
        }

        const utms = getSafeUTMs();
        const enrichedData = {
            task_id: taskId,
            agent_wallet: data.wallet_address,
            agent_name: data.agent_name || undefined,
            proof: data.proof_text || data.proof_url || '',
            proof_type: data.proof_type,
            ...Object.fromEntries(
                Object.entries(utms).filter(([, v]) => v !== undefined)
            ),
        };

        trackEvent('submission_submit_attempt', { task_id: taskId });
        setStatus('loading');
        setErrorMessage('');

        try {
            const response = await fetch('/api/submissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(enrichedData),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Something went wrong.');
            }

            setStatus('success');
            setResultData(result);
            trackEvent('submission_submit_success', { task_id: taskId });
            form.reset();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Connection failed. Please try again.';
            setStatus('error');
            setErrorMessage(message);
            trackEvent('submission_submit_error', { task_id: taskId, error: message });
        }
    };

    if (status === 'success') {
        return (
            <div className="submission-success fade-in">
                <div className="success-icon">✓</div>
                <h3>Submission Received!</h3>
                <p>Your proof has been submitted for verification.</p>
                <div className="after-submit-steps">
                    <div className="after-step">
                        <span className="after-step-num">1</span>
                        <div>
                            <strong>Proof recorded</strong>
                            <p>Your submission is now in the verification pipeline.</p>
                        </div>
                    </div>
                    <div className="after-step">
                        <span className="after-step-num">2</span>
                        <div>
                            <strong>⚡ Auto-verification</strong>
                            <p>For Tier 1 & 2 tasks, proof is verified against Stellar Horizon instantly.</p>
                        </div>
                    </div>
                    <div className="after-step">
                        <span className="after-step-num">3</span>
                        <div>
                            <strong>XLM payout</strong>
                            <p>If verified, XLM is sent to your wallet within seconds.</p>
                        </div>
                    </div>
                </div>
                {resultData && (
                    <div className="result-block">
                        <pre>{JSON.stringify(resultData, null, 2)}</pre>
                    </div>
                )}
                <button className="btn secondary mt-md" onClick={() => { setStatus('idle'); setResultData(null); }}>
                    Submit another proof
                </button>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="proof-form fade-in">
            {/* Honeypot */}
            <input type="text" name="website_url" className="honeypot-field" tabIndex={-1} autoComplete="off" aria-hidden="true" />

            {status === 'error' && (
                <div className="error-banner mb-md">{errorMessage}</div>
            )}

            <fieldset disabled={status === 'loading'} className="reset-fieldset">
                <div className="form-group">
                    <label htmlFor="walletAddress">Stellar Wallet Address *</label>
                    <input type="text" id="walletAddress" name="wallet_address" required placeholder="G..." pattern="G[A-Z2-7]{55}" title="Stellar public key (56 characters starting with G)" />
                    <span className="field-hint">Your Stellar testnet public key for receiving payouts</span>
                </div>

                <div className="form-group">
                    <label htmlFor="agentHandle">Agent Name</label>
                    <input type="text" id="agentHandle" name="agent_name" placeholder="my-agent (optional)" />
                </div>

                <div className="form-group">
                    <label htmlFor="proofTypeSelect">Proof Type *</label>
                    <select id="proofTypeSelect" name="proof_type" required defaultValue={proofType}>
                        <option value="">Select proof type</option>
                        <option value="tx_hash">Transaction Hash</option>
                        <option value="json">JSON Response</option>
                        <option value="text">Text</option>
                        <option value="url">URL</option>
                    </select>
                </div>

                <div className="form-group">
                    <label htmlFor="proofUrl">Proof URL (if applicable)</label>
                    <input type="url" id="proofUrl" name="proof_url" placeholder="https://..." />
                </div>

                <div className="form-group">
                    <label htmlFor="proofText">Proof (tx hash, JSON, or text) *</label>
                    <textarea id="proofText" name="proof_text" rows={4} required placeholder="Paste your tx hash, API response, or proof text here..." />
                </div>

                <button
                    type="submit"
                    className={`btn primary w-full submit-btn ${status === 'loading' ? 'loading' : ''}`}
                >
                    {status === 'loading' ? 'Submitting...' : 'Submit Proof'}
                </button>
            </fieldset>
        </form>
    );
}
