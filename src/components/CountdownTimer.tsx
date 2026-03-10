import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

const getTimeUntilMidnight = () => {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight.getTime() - now.getTime();
  return {
    hours: Math.floor(diff / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  };
};

interface CountdownTimerProps {
  variant?: 'compact' | 'full';
  className?: string;
}

const CountdownTimer = ({ variant = 'compact', className = '' }: CountdownTimerProps) => {
  const [time, setTime] = useState(getTimeUntilMidnight());

  useEffect(() => {
    const interval = setInterval(() => setTime(getTimeUntilMidnight()), 1000);
    return () => clearInterval(interval);
  }, []);

  const pad = (n: number) => String(n).padStart(2, '0');

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-1 text-[10px] font-bold text-destructive ${className}`}>
        <Clock className="w-3 h-3" />
        <span>{pad(time.hours)}:{pad(time.minutes)}:{pad(time.seconds)}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Clock className="w-5 h-5 text-destructive animate-pulse" />
      <div className="flex items-center gap-1.5">
        {[
          { value: time.hours, label: 'h' },
          { value: time.minutes, label: 'm' },
          { value: time.seconds, label: 's' },
        ].map((unit, i) => (
          <div key={i} className="flex items-center gap-0.5">
            {i > 0 && <span className="text-destructive font-bold text-lg">:</span>}
            <div className="bg-destructive text-destructive-foreground rounded-md px-2 py-1 min-w-[36px] text-center">
              <span className="text-lg font-bold font-mono">{pad(unit.value)}</span>
            </div>
            <span className="text-[10px] text-muted-foreground font-medium">{unit.label}</span>
          </div>
        ))}
      </div>
      <span className="text-sm font-semibold text-destructive">Oferta encerra hoje!</span>
    </div>
  );
};

export default CountdownTimer;
