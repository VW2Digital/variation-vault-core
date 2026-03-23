import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchSetting } from '@/lib/api';

const ChatWidgetEmbed = () => {
  const [widgetCode, setWidgetCode] = useState('');
  const location = useLocation();
  const injectedRef = useRef(false);

  useEffect(() => {
    fetchSetting('chat_widget_code').then((code) => {
      console.log('[ChatWidget] fetched code length:', code?.length, 'code:', code?.substring(0, 100));
      if (code) setWidgetCode(code);
    }).catch((err) => {
      console.error('[ChatWidget] fetch error:', err);
    });
  }, []);

  useEffect(() => {
    console.log('[ChatWidget] effect run, widgetCode length:', widgetCode?.length, 'injected:', injectedRef.current, 'path:', location.pathname);
    
    if (!widgetCode || injectedRef.current) return;
    if (location.pathname.startsWith('/admin') || location.pathname === '/login') return;

    injectedRef.current = true;

    // Extract script content using regex
    const scriptPattern = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
    const srcPattern = /src\s*=\s*['"]([^'"]+)['"]/i;
    let match;
    let found = 0;

    while ((match = scriptPattern.exec(widgetCode)) !== null) {
      const attrs = match[1] || '';
      const content = match[2] || '';
      const srcMatch = srcPattern.exec(attrs);
      found++;

      const script = document.createElement('script');

      if (srcMatch) {
        script.src = srcMatch[1];
        script.async = true;
        console.log('[ChatWidget] injecting external script:', srcMatch[1]);
      } else if (content.trim()) {
        script.textContent = content;
        console.log('[ChatWidget] injecting inline script, length:', content.trim().length);
      } else {
        continue;
      }

      document.body.appendChild(script);
    }

    console.log('[ChatWidget] total scripts found:', found);
  }, [widgetCode, location.pathname]);

  return null;
};

export default ChatWidgetEmbed;
