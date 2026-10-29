import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatText } from '../components/ChatText';
it('escapes HTML in chat content while retaining bold text and bullets', () => {
  const html = renderToStaticMarkup(<ChatText text={'<img src=x onerror=alert(1)>\n- **Hello**'} />);
  expect(html).not.toContain('<img');
  expect(html).toContain('&lt;img');
  expect(html).toContain('<strong>Hello</strong>');
});
