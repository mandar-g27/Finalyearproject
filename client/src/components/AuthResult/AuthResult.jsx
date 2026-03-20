import { ShieldCheck, ShieldX, Clock, RotateCcw } from 'lucide-react';
import './AuthResult.css';

const CONFIG = {
  granted: {
    cls: 'granted',
    icon: <ShieldCheck size={56} />,
    title: 'Door Unlocked',
    message: 'All three biometric factors verified. Access has been granted.',
  },
  denied: {
    cls: 'denied',
    icon: <ShieldX size={56} />,
    title: 'Access Denied',
    message: 'Biometric verification failed. Identity could not be confirmed.',
  },
  expired: {
    cls: 'expired',
    icon: <Clock size={56} />,
    title: 'Session Expired',
    message: 'The fingerprint scan timed out. Please restart the authentication process.',
  },
};

export default function AuthResult({ status, onRetry }) {
  const { cls, icon, title, message } = CONFIG[status] ?? CONFIG.denied;

  return (
    <div className="auth-result">
      <div className={`result-icon-wrap ${cls}`}>
        <div className={`result-icon-ring ${cls}`} />
        {icon}
      </div>

      <h2 className={`result-title ${cls}`}>{title}</h2>
      <p className="result-message">{message}</p>

      <div className="result-actions">
        <button className="btn btn-primary" onClick={onRetry}>
          <RotateCcw size={16} />
          Try Again
        </button>
      </div>
    </div>
  );
}
