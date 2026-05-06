import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReactNode } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  /** Conteúdo extra à direita do input (ex.: botão "Gerar"). */
  trailing?: ReactNode;
  readOnly?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLInputElement>) => void;
}

/** Label + Input padronizado para configurações de gateways (campos não-sensíveis). */
const TextField = ({ label, value, onChange, placeholder, hint, trailing, readOnly, className, onClick }: Props) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    {trailing ? (
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          onClick={onClick}
          className={`flex-1 ${className ?? ''}`}
        />
        {trailing}
      </div>
    ) : (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        onClick={onClick}
        className={className}
      />
    )}
    {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);

export default TextField;