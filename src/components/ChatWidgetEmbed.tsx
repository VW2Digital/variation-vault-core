import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchSetting } from '@/lib/api';

/**
 * Loads an embeddable chat widget from site_settings.
 * Parses HTML string to extract and execute script tags.
 */
const ChatWidgetEmbed = () => {
  const [widgetCode, setWidgetCode] = useState('');
  const location = useLocation();
  const injectedRef = useRef(false);

  useEffect(() => {
    fetchSetting('chat_widget_code').then((code) => {
      if (code) setWidgetCode(code);
    });
  }, []);

  useEffect(() => {
    if (!widgetCode || injectedRef.current) return;
    if (location.pathname.startsWith('/admin') || location.pathname === '/login') return;

    injectedRef.current = true;

    // Match all <script ...>...</script> blocks
    const scriptPattern = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
    const srcPattern = /src\s*=\s*['"]([^'"]+)['"]/i;
    let match;

    while ((match = scriptPattern.exec(widgetCode)) !== null) {
      const attrs = match[1] || '';
      const content = match[2] || '';
      const srcMatch = srcPattern.exec(attrs);

      const script = document.createElement('script');

      if (srcMatch) {
        // External script
        script.src = srcMatch[1];
        script.async = true;
      } else if (content.trim()) {
        // Inline script
        script.textContent = content;
      } else {
        continue;
      }

      document.body.appendChild(script);
    }
  }, [widgetCode, location.pathname]);

  return null;
};

export default ChatWidgetEmbed;
