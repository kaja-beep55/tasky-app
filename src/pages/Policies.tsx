import type { ReactNode } from 'react';

function PolicyShell({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="stack">
            <div className="page-head"><h1>{title}</h1></div>
            <div className="card panel policy-body">{children}</div>
        </div>
    );
}

export function Privacy() {
    return (
        <PolicyShell title="Privacy Policy">
            <p>Tasky keeps data collection minimal. This policy explains what we store and why.</p>
            <h2>What we collect</h2>
            <ul>
                <li>Profile details you enter: name, country, and state.</li>
                <li>A username and user ID generated for your account.</li>
                <li>Your password and recovery code, stored only as secure one-way hashes.</li>
                <li>Your coin balance and coin transaction history.</li>
                <li>Task submission records (task, time, status). Proof videos are sent by you directly on WhatsApp and are never uploaded to or stored by Tasky.</li>
            </ul>
            <h2>What we never collect</h2>
            <ul>
                <li>Your email address, phone number, or OTP.</li>
                <li>Your proof videos or WhatsApp messages.</li>
            </ul>
            <h2>How we use data</h2>
            <ul>
                <li>To run your account, track coins, and verify task completions.</li>
                <li>To keep the platform secure (rate limiting, audit logs).</li>
            </ul>
            <h2>Consent</h2>
            <p>By creating a profile you consent to the storage described above. You can withdraw consent at any time by requesting account deletion.</p>
            <h2>Your rights &amp; data deletion</h2>
            <ul>
                <li>You may request a copy of your data or correction of wrong details via the Contact / Grievance page.</li>
                <li>You may request deletion of your account and associated personal data at any time. Deletion removes your profile, login credentials, and recovery data. Coin transaction history is anonymised and retained for financial audit purposes.</li>
                <li>Requests are processed within 30 days, in line with India's DPDP Act 2023 and GDPR principles (access, correction, erasure).</li>
            </ul>
            <h2>Data retention</h2>
            <p>Profile and session data is kept while your account is active. Security and audit logs are retained for up to 12 months.</p>
            <h2>Contact</h2>
            <p>For privacy questions or deletion requests, use the Contact / Grievance page.</p>
        </PolicyShell>
    );
}

export function Terms() {
    return (
        <PolicyShell title="Terms & Conditions">
            <p>By using Tasky you agree to these terms.</p>
            <h2>The service</h2>
            <ul>
                <li>Tasky lists small online tasks with coin rewards.</li>
                <li>You complete a task, record proof, and send it on WhatsApp.</li>
                <li>Coins are credited manually by an admin after review.</li>
            </ul>
            <h2>Your responsibilities</h2>
            <ul>
                <li>Provide accurate profile information.</li>
                <li>Complete tasks genuinely; fraudulent proof leads to rejection.</li>
                <li>Keep your password and recovery code safe.</li>
            </ul>
            <h2>Coins</h2>
            <ul>
                <li>Coins are an in-app reward record. Admins may add, deduct, or reset coins with a recorded reason.</li>
                <li>All balance changes are logged in your coin history.</li>
            </ul>
        </PolicyShell>
    );
}

export function Prohibited() {
    return (
        <PolicyShell title="Prohibited Activities">
            <p>The following are not allowed on Tasky:</p>
            <ul>
                <li>Submitting fake, edited, or someone else's proof videos.</li>
                <li>Creating multiple accounts to farm rewards.</li>
                <li>Attempting to access other users' accounts or data.</li>
                <li>Trying to manipulate coin balances or exploit the platform.</li>
                <li>Automated abuse, spam, or attacks against the service.</li>
                <li>Any unlawful activity.</li>
            </ul>
            <p>Violations may lead to coin removal, suspension, or a permanent ban.</p>
        </PolicyShell>
    );
}

export function Contact() {
    return (
        <PolicyShell title="Contact / Grievance">
            <p>Need help or want to raise a complaint?</p>
            <h2>How to reach us</h2>
            <ul>
                <li>Message us on WhatsApp using the button on the home page.</li>
                <li>Include your username or user ID so we can find your account.</li>
            </ul>
            <h2>Grievances</h2>
            <ul>
                <li>Describe the issue clearly with your user ID and task number if relevant.</li>
                <li>We review grievances and respond as soon as possible, and no later than 30 days (per India's DPDP Act grievance requirement).</li>
                <li>For account or personal data deletion requests, say "delete my account" with your username; see the Privacy Policy for what is removed.</li>
            </ul>
        </PolicyShell>
    );
}
