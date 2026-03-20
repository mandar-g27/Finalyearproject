import { Check } from 'lucide-react';
import './StepIndicator.css';

/**
 * @param {{ steps: {label: string, icon?: React.ReactNode}[], currentStep: number }} props
 * currentStep is 0-indexed
 */
export default function StepIndicator({ steps, currentStep }) {
  return (
    <div className="step-indicator">
      {steps.map((step, i) => {
        const isCompleted = i < currentStep;
        const isActive = i === currentStep;

        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div className={`step-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
              <div className="step-circle">
                {isCompleted ? <Check size={18} /> : (step.icon || i + 1)}
              </div>
              <span className="step-label">{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`step-connector ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
