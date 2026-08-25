export function CoinDisc() {
    return <span className="coin-disc" aria-hidden="true">¢</span>;
}

export function CoinPill({ amount }: { amount: number }) {
    return (
        <span className="coin-pill" title="Coin balance">
            <CoinDisc />
            <span>{amount.toLocaleString()}</span>
        </span>
    );
}
