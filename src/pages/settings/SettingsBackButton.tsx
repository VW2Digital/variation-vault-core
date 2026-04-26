import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SettingsBackButtonProps {
  title: string;
  description?: string;
}

const SettingsBackButton = ({ title, description }: SettingsBackButtonProps) => {
  const navigate = useNavigate();

  return (
    <div className="flex items-start gap-3 mb-6">
      <Button variant="ghost" size="icon" onClick={() => navigate('/admin/configuracoes')} className="shrink-0 mt-0.5">
        <ArrowLeft className="w-4 h-4" />
      </Button>
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
    </div>
  );
};

export default SettingsBackButton;
