import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchSetting } from '@/lib/api';

/**
 * Loads an embeddable chat widget script from site_settings.
 * Injects it directly into document.body on public pages.
 */
const ChatWidgetEmbed = () => {
  const [widgetCode, setWidgetCode] = useState('');
  const location = useLocation();

  useEffect(() => {
    fetchSetting('chat_widget_code').then((code) => {
      if (code) setWidgetCode(code);
    });
  }, []);

  useEffect(() => {
    if (!widgetCode) return;

    // Don't render on admin or login pages
    if (location.pathname.startsWith('/admin') || location.pathname === '/login') return;

    // Parse the widget code to extract script src or inline code
    const parser = new DOMParser();
    const doc = parser.parseFromString(widgetCode, 'text/html');
    const scriptTags = doc.querySelectorAll('script');

    const addedScripts: HTMLScriptElement[] = [];

    scriptTags.forEach((tag) => {
      const script = document.createElement('script');
      if (tag.src) {
        script.src = tag.src;
      }
      if (tag.textContent) {
        script.textContent = tag.textContent;
      }
      script.async = true;
      document.body.appendChild(script);
      addedScripts.push(script);
    });

    return () => {
      addedScripts.forEach((s) => {
        try { document.body.removeChild(s); } catch {}
      });
    };
  }, [widgetCode, location.pathname]);

  return null;
};

export default ChatWidgetEmbed;
