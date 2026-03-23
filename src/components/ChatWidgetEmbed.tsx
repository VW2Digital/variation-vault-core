import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchSetting } from '@/lib/api';

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
    if (location.pathname.startsWith('/admin') || location.pathname === '/login') return;

    // Check if already injected by looking for our marker
    if (document.getElementById('crm-chat-widget-injected')) return;

    // Create a marker element
    const marker = document.createElement('div');
    marker.id = 'crm-chat-widget-injected';
    marker.style.display = 'none';
    document.body.appendChild(marker);

    // Extract and inject script tags using regex
    const scriptPattern = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
    const srcPattern = /src\s*=\s*['"]([^'"]+)['"]/i;
    let match;

    while ((match = scriptPattern.exec(widgetCode)) !== null) {
      const attrs = match[1] || '';
      const content = match[2] || '';
      const srcMatch = srcPattern.exec(attrs);

      const script = document.createElement('script');

      if (srcMatch) {
        script.src = srcMatch[1];
        script.async = true;
      } else if (content.trim()) {
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
