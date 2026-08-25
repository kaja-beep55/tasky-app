import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface Props {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    autoComplete?: string;
    placeholder?: string;
    maxLength?: number;
}

export default function PasswordField({ id, label, value, onChange, autoComplete, placeholder, maxLength }: Props) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="field">
            <label htmlFor={id}>{label}</label>
            <div className="input-wrap">
                <input
                    id={id}
                    type={visible ? 'text' : 'password'}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    autoComplete={autoComplete ?? 'new-password'}
                    placeholder={placeholder}
                    maxLength={maxLength ?? 128}
                    style={{ paddingRight: 44 }}
                />
                <button
                    type="button"
                    className="eye-btn"
                    onClick={() => setVisible(v => !v)}
                    aria-label={visible ? 'Hide password' : 'Show password'}
                    aria-pressed={visible}
                >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>
        </div>
    );
}
