import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchSetting } from '@/lib/api';

/**
 * Loads an embeddable chat widget script from site_settings.
 * Extracts and injects scripts directly into document.body.
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

    // Don't render on admin or login pages
    if (location.pathname.startsWith('/admin') || location.pathname === '/login') return;

    injectedRef.current = true;

    // Extract script src URLs
    const srcRegex = /<script[^>]+src=['"]([^'"]+)['"]/gi;
    let srcMatch;
    while ((srcMatch = srcRegex.exec(widgetCode)) !== null) {
      const script = document.createElement('script');
      script.src = srcMatch[1];
      script.async = true;
      document.body.appendChild(script);
    }

    // Extract inline script content
    const inlineRegex = /<script(?:\s[^>]*)?>([^]*?)<\/script>/gi;
    let inlineMatch;
    while ((inlineMatch = inlineRegex.exec(widgetCode)) !== null) {
      const content = inlineMatch[1].trim();
      // Skip if it's a src-only tag (no meaningful inline content)
      if (!content || content.length < 5) continue;
      const script = document.createElement('script');
      script.textContent = content;
      document.body.appendChild(script);
    }
  }, [widgetCode, location.pathname]);

  return null;
};

export default ChatWidgetEmbed;
