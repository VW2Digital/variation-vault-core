import { useEffect, useState } from 'react';
import { X, Globe } from 'lucide-react';
import { useLanguage, languages, type Language } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';

const SUPPORTED: Language[] = ['pt', 'es', 'en', 'zh'];
const DISMISS_KEY = 'language-banner-dismissed';

const detectBrowserLanguage = (): Language | null => {
  if (typeof navigator === 'undefined') return null;
  const candidates = [...(navigator.languages || []), navigator.language].filter(Boolean);
  for (const raw of candidates) {
    const lower = raw.toLowerCase();
    if (lower.startsWith('pt')) return 'pt';
    if (lower.startsWith('es')) return 'es';
    if (lower.startsWith('en')) return 'en';
    if (lower.startsWith('zh')) return 'zh';
  }
  return null;
};

const messages: Record<Language, { text: string; change: string }> = {
  pt: { text: 'Detectamos seu idioma como', change: 'Mudar' },
  es: { text: 'Detectamos su idioma como', change: 'Cambiar' },
  en: { text: 'We detected your language as', change: 'Switch' },
  zh: { text: '我们检测到您的语言是', change: '切换' },
};

const LanguageDetectionBanner = () => {
  const { lang, setLang } = useLanguage();
  const [detected, setDetected] = useState<Language | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    const browserLang = detectBrowserLanguage();
    if (browserLang && browserLang !== lang && SUPPORTED.includes(browserLang)) {
      setDetected(browserLang);
      setVisible(true);
    }
  }, [lang]);

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  const handleSwitch = () => {
    if (detected) setLang(detected);
    handleDismiss();
  };

  if (!visible || !detected) return null;

  const detectedInfo = languages.find((l) => l.code === detected);
  const msg = messages[lang];

  return (
    <div className="bg-muted/80 border-b border-border backdrop-blur-sm">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
          <Globe className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">
            {msg.text}{' '}
            <strong className="text-foreground">{detectedInfo?.label}</strong>.
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSwitch}
            className="h-7 px-3 text-xs gap-1.5"
          >
            {detectedInfo && (
              <img
                src={`https://flagcdn.com/w40/${detectedInfo.flag}.png`}
                alt=""
                className="w-4 h-3 object-cover rounded-sm"
              />
            )}
            {msg.change}
          </Button>
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default LanguageDetectionBanner;
