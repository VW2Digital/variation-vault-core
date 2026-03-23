import { useEffect, useState } from 'react';
import { fetchSetting } from '@/lib/api';

/**
 * Renders an embeddable chat widget script/HTML from site_settings.
 * Only renders on public (non-admin) pages.
 */
const ChatWidgetEmbed = () => {
  const [widgetCode, setWidgetCode] = useState('');

  useEffect(() => {
    fetchSetting('chat_widget_code').then((code) => {
      if (code) setWidgetCode(code);
    });
  }, []);

  useEffect(() => {
    if (!widgetCode) return;

    // Don't render on admin pages
    if (window.location.pathname.startsWith('/admin') || window.location.pathname === '/login') return;

    const container = document.getElementById('chat-widget-container');
    if (!container) return;

    container.innerHTML = widgetCode;

    // Execute any <script> tags inside the widget code
    const scripts = container.querySelectorAll('script');
    scripts.forEach((oldScript) => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    });

    return () => {
      if (container) container.innerHTML = '';
    };
  }, [widgetCode]);

  if (!widgetCode) return null;

  return <div id="chat-widget-container" />;
};

export default ChatWidgetEmbed;
