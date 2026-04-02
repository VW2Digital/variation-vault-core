import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutDashboard, Megaphone, MousePointerClick } from 'lucide-react';
import SettingsBackButton from './SettingsBackButton';

const SettingsHomePage = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton title="Página Inicial" description="Gestão de banners e popups promocionais" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card
          className="border-border/50 cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigate('/admin/banners')}
        >
          <CardContent className="flex items-center gap-4 py-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-muted">
              <Megaphone className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">Banners</p>
              <p className="text-sm text-muted-foreground">Gerenciar banners do carrossel</p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="border-border/50 cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigate('/admin/popups')}
        >
          <CardContent className="flex items-center gap-4 py-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-muted">
              <MousePointerClick className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">Popups</p>
              <p className="text-sm text-muted-foreground">Gerenciar popups promocionais</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SettingsHomePage;
