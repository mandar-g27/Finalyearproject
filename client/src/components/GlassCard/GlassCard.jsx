import './GlassCard.css';

export default function GlassCard({ children, className = '', compact = false, noHover = false, flush = false, style = {} }) {
  const classes = [
    'glass-card',
    compact && 'compact',
    noHover && 'no-hover',
    flush && 'flush',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}
