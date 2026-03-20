import './StatusBadge.css';

const labels = {
  granted: 'Granted',
  denied: 'Denied',
  waiting: 'Waiting',
  waiting_fp: 'Awaiting Fingerprint',
  expired: 'Expired',
  online: 'Online',
  offline: 'Offline',
};

export default function StatusBadge({ status }) {
  const label = labels[status] || status;

  return (
    <span className={`status-badge ${status}`}>
      <span className="dot" />
      {label}
    </span>
  );
}
