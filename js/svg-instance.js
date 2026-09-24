/**
 * Give each on-page drawing its own SVG definitions. The kit deliberately
 * returns deterministic ids; repeated previews need document-local ids so a
 * hidden thumbnail cannot capture another drawing's gradient or text path.
 * Export files still go directly through the unchanged kit serializer.
 */
let instance = 0;

export function isolateSvg(svg) {
  const suffix = `-view-${++instance}`;
  const ids = new Map();
  for (const node of svg.querySelectorAll('[id]')) {
    const old = node.id;
    ids.set(old, old + suffix);
    node.id = old + suffix;
  }
  for (const node of [svg, ...svg.querySelectorAll('*')]) {
    for (const attr of Array.from(node.attributes)) {
      let value = attr.value.replace(/url\(#([^)]+)\)/g, (match, id) => ids.has(id) ? `url(#${ids.get(id)})` : match);
      if ((attr.localName === 'href') && value.startsWith('#') && ids.has(value.slice(1))) value = `#${ids.get(value.slice(1))}`;
      if (value !== attr.value) node.setAttributeNS(attr.namespaceURI, attr.name, value);
    }
  }
  return svg;
}
