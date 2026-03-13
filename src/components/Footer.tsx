import { useLanguage } from '@/contexts/LanguageContext';

const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-border/50 bg-card mt-12">
      <div className="max-w-7xl mx-auto px-4 py-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Liberty Pharma — {t('allRights')}</p>
      </div>
    </footer>
  );
};

export default Footer;
