import { Keypair } from '@stellar/stellar-sdk';
import fs from 'fs';

// Configuration
const BASE_URL = process.env.API_URL || 'https://stellar-agent-earn.vercel.app';
console.log(`Testing against API: ${BASE_URL}\n`);

async function runE2E() {
    try {
        console.log('🤖 Starting E2E Agent Simulation');
        
        // 1. Generate Keypair
        console.log('⏳ [1/5] Generating Stellar Keypair...');
        const keypair = Keypair.random();
        const publicKey = keypair.publicKey();
        const secret = keypair.secret();
        console.log(`   Wallet: ${publicKey}\n   Secret: ${secret}\n`);

        // 2. Fund via Friendbot
        console.log('⏳ [2/5] Requesting funds from Friendbot...');
        const friendbotUrl = `https://friendbot.stellar.org/?addr=${encodeURIComponent(publicKey)}`;
        const friendbotRes = await fetch(friendbotUrl);
        if (!friendbotRes.ok) {
            throw new Error(`Friendbot failed: ${await friendbotRes.text()}`);
        }
        console.log('   ✅ Wallet funded with test XLM!\n');

        // wait 2 seconds for horizon to catch up
        await new Promise(r => setTimeout(r, 2000));

        // 3. Register Agent
        const agentName = `e2e-agent-${Math.floor(Math.random() * 10000)}`;
        console.log(`⏳ [3/5] Registering agent "${agentName}"...`);
        const registerRes = await fetch(`${BASE_URL}/api/agents`, {
            method: 'POST',
            headers: { 'Content-type': 'application/json' },
            body: JSON.stringify({
                name: agentName,
                wallet: publicKey
            })
        });
        
        const registerData = await registerRes.json();
        if (!registerRes.ok) {
            console.error('   ❌ Registration failed:', registerData);
            throw new Error(`Failed to register agent`);
        }
        console.log('   ✅ Agent registered successfully!\n');
        
        // 4. Emulate Tasks
        const tasksToComplete = [
            {
                task_id: 'task-001', // Onboarding: Create wallet
                proof_type: 'tx_hash',
                proof: '0000000000000000000000000000000000000000000000000000000000' // dummy hash
            },
            {
                task_id: 'task-002', // Read Stellar Ledger
                proof_type: 'json',
                proof: '{"sequence": 1234567, "hash": "abcd..."}'
            },
            {
                task_id: 'task-024', // Check Escrow balance
                proof_type: 'text',
                proof: 'Balance is 500 XLM'
            }
        ];

        console.log('⏳ [4/5] Submitting task proofs...\n');
        
        for (const [index, task] of tasksToComplete.entries()) {
            console.log(`   Task ${index + 1}: ${task.task_id}`);
            const submitRes = await fetch(`${BASE_URL}/api/submissions`, {
                method: 'POST',
                headers: { 'Content-type': 'application/json' },
                body: JSON.stringify({
                    task_id: task.task_id,
                    agent_wallet: publicKey,
                    agent_name: agentName,
                    proof_type: task.proof_type,
                    proof: task.proof
                })
            });
            const submitData = await submitRes.json();
            
            if (submitRes.ok) {
                console.log(`   ✅ Success! Response:`, JSON.stringify(submitData, null, 2));
            } else {
                console.log(`   ⚠️ Failed! Status ${submitRes.status}:`, submitData);
            }
            console.log('');
            // Optional delay between tasks
            await new Promise(r => setTimeout(r, 1000));
        }

        console.log('🏁 [5/5] E2E Simulation completed!');

    } catch (e) {
        console.error('❌ E2E process failed:', e);
    }
}

runE2E();
