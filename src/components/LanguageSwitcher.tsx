import { useLanguage, languages } from '@/contexts/LanguageContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const FlagIcon = ({ code, className = '' }: { code: string; className?: string }) => (
  <img
    src={`https://flagcdn.com/${code}.svg`}
    srcSet={`https://flagcdn.com/w40/${code}.png 1x, https://flagcdn.com/w80/${code}.png 2x`}
    alt={`Bandeira ${code.toUpperCase()}`}
    loading="lazy"
    className={`inline-block object-cover rounded-sm shadow-sm ${className}`}
  />
);

const LanguageSwitcher = () => {
  const { lang, setLang } = useLanguage();
  const current = languages.find((l) => l.code === lang) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors outline-none">
        <FlagIcon code={current.flag} className="w-5 h-[14px]" />
        <span className="font-medium">{current.short}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {languages.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLang(l.code)}
            className={`flex items-center gap-3 cursor-pointer ${l.code === lang ? 'bg-accent' : ''}`}
          >
            <FlagIcon code={l.flag} className="w-6 h-[18px]" />
            <span className="font-medium w-7">{l.short}</span>
            <span className="text-muted-foreground">{l.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;
