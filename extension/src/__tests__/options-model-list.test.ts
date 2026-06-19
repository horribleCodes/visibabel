/**
 * @jest-environment jsdom
 */

// Simulate DOM for options model list rendering
function setListItems(
  list: HTMLUListElement,
  items: string[],
  emptyLabel: string
): void {
  list.innerHTML = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.textContent = emptyLabel;
    list.appendChild(li);
    return;
  }
  items.forEach((item: string) => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });
}

describe('options model list rendering', () => {
  let ul: HTMLUListElement;
  beforeEach(() => {
    ul = document.createElement('ul');
  });

  test('renders empty label if no items', () => {
    setListItems(ul, [], 'No models');
    expect(ul.children.length).toBe(1);
    expect(ul.children[0].textContent).toBe('No models');
  });

  test('renders all items as list elements', () => {
    setListItems(ul, ['foo', 'bar'], 'No models');
    expect(ul.children.length).toBe(2);
    expect(ul.children[0].textContent).toBe('foo');
    expect(ul.children[1].textContent).toBe('bar');
  });
});
