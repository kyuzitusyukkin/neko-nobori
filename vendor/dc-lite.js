/* dc-lite: x-dc テンプレートを React で動かすための小さなランタイム（ミニゲーム単体公開用） */
(function () {
  'use strict';
  var h = React.createElement;

  var EVENTS = ['onClick', 'onDoubleClick', 'onContextMenu', 'onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel',
    'onPointerEnter', 'onPointerLeave', 'onPointerOver', 'onPointerOut', 'onGotPointerCapture', 'onLostPointerCapture',
    'onMouseDown', 'onMouseMove', 'onMouseUp', 'onMouseEnter', 'onMouseLeave', 'onTouchStart', 'onTouchMove', 'onTouchEnd',
    'onTouchCancel', 'onKeyDown', 'onKeyUp', 'onInput', 'onChange', 'onFocus', 'onBlur', 'onSubmit', 'onScroll', 'onWheel',
    'onAnimationEnd', 'onAnimationStart', 'onAnimationIteration', 'onTransitionEnd', 'onLoad', 'onError', 'onDragStart'];
  var ATTR = { 'class': 'className', 'for': 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength',
    colspan: 'colSpan', rowspan: 'rowSpan', autoplay: 'autoPlay', playsinline: 'playsInline', autofocus: 'autoFocus',
    contenteditable: 'contentEditable', spellcheck: 'spellCheck', crossorigin: 'crossOrigin', srcset: 'srcSet',
    enterkeyhint: 'enterKeyHint', inputmode: 'inputMode', autocomplete: 'autoComplete', 'xlink:href': 'xlinkHref' };
  EVENTS.forEach(function (e) { ATTR[e.toLowerCase()] = e; });

  var HOLE = /\{\{\s*([^}]*?)\s*\}\}/g;
  var WHOLE = /^\{\{\s*([^}]*?)\s*\}\}$/;

  function lookup(scope, path) {
    if (path === 'true') return true; if (path === 'false') return false;
    if (path === 'null') return null; if (path === 'undefined') return undefined;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var m = /^(['"])(.*)\1$/.exec(path); if (m) return m[2];
    var parts = path.split('.'); var v = scope;
    for (var i = 0; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
    return v;
  }
  function strOf(v) { return v == null || v === false ? '' : String(v); }
  function compileStr(s) {
    var w = WHOLE.exec(s);
    if (w) { var p = w[1]; return function (sc) { return lookup(sc, p); }; }
    if (s.indexOf('{{') < 0) return function () { return s; };
    var segs = []; var last = 0; s.replace(HOLE, function (all, p, idx) { segs.push(s.slice(last, idx)); segs.push({ p: p }); last = idx + all.length; return all; });
    segs.push(s.slice(last));
    return function (sc) { var out = ''; for (var i = 0; i < segs.length; i++) { var g = segs[i]; out += typeof g === 'string' ? g : strOf(lookup(sc, g.p)); } return out; };
  }
  function splitDecl(css) {
    var out = [], depth = 0, cur = '', q = null;
    for (var i = 0; i < css.length; i++) {
      var c = css[i];
      if (q) { if (c === q) q = null; cur += c; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      if (c === '(') depth++; else if (c === ')') depth--;
      if (c === ';' && depth === 0) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur); return out;
  }
  var styleCache = new Map();
  function styleObj(css) {
    if (typeof css !== 'string') return css;
    var hit = styleCache.get(css); if (hit) return hit;
    var o = {};
    splitDecl(css).forEach(function (d) {
      var k = d.indexOf(':'); if (k < 0) return;
      var name = d.slice(0, k).trim(); var val = d.slice(k + 1).trim(); if (!name) return;
      if (name.indexOf('--') !== 0) {
        name = name.toLowerCase();
        if (name.indexOf('-ms-') === 0) name = name.slice(1);
        name = name.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
      }
      o[name] = val;
    });
    if (styleCache.size > 4000) styleCache.clear();
    styleCache.set(css, o); return o;
  }
  function compileChildren(nodes) {
    var fns = [];
    for (var i = 0; i < nodes.length; i++) { var f = compileNode(nodes[i]); if (f) fns.push(f); }
    if (!fns.length) return function () { return null; };
    if (fns.length === 1) return fns[0];
    return function (sc) { var out = []; for (var i = 0; i < fns.length; i++) out.push(fns[i](sc)); return out; };
  }
  function spread(tag, p, c) { if (c == null) return h(tag, p); if (Array.isArray(c) && !c.__keyed) return h.apply(null, [tag, p].concat(c)); return h(tag, p, c); }
  function compileNode(n) {
    if (n.nodeType === 3) {
      var t = n.nodeValue;
      if (/^\s*$/.test(t)) { if (t.indexOf('\n') >= 0) return null; return function () { return t; }; }
      t = t.replace(/^\s*\n\s*/, '').replace(/\s*\n\s*$/, '').replace(/\s*\n\s*/g, ' ');
      var f = compileStr(t); return function (sc) { var v = f(sc); return v == null || v === false || v === true ? null : (typeof v === 'object' ? String(v) : v); };
    }
    if (n.nodeType !== 1) return null;
    var tag = n.localName;
    if (tag === 'sc-if') {
      var cond = compileStr(n.getAttribute('value') || '');
      var kids = compileChildren(n.childNodes);
      return function (sc) { return cond(sc) ? spread(React.Fragment, null, kids(sc)) : null; };
    }
    if (tag === 'sc-for') {
      var list = compileStr(n.getAttribute('list') || ''); var as = n.getAttribute('as') || 'item';
      var body = compileChildren(n.childNodes);
      return function (sc) {
        var arr = list(sc); if (!arr || !arr.length) return null;
        var out = [];
        for (var i = 0; i < arr.length; i++) { var s2 = Object.create(sc); s2[as] = arr[i]; s2.$index = i; out.push(spread(React.Fragment, { key: i }, body(s2))); }
        out.__keyed = true; return out;
      };
    }
    var props = [];
    for (var a = 0; a < n.attributes.length; a++) {
      var at = n.attributes[a]; var name = at.name;
      if (name.indexOf('hint-') === 0) continue;
      var rn = ATTR[name] || name;
      props.push([rn, compileStr(at.value)]);
    }
    var kidsFn = compileChildren((tag === 'template' ? n.content : n).childNodes);
    return function (sc) {
      var p = {};
      for (var i = 0; i < props.length; i++) {
        var k = props[i][0], v = props[i][1](sc);
        if (k === 'style') v = styleObj(v);
        if (v === undefined) continue;
        p[k] = v;
      }
      return spread(tag, p, kidsFn(sc));
    };
  }

  window.DCLogic = class DCLogic extends React.Component {
    render() { var vals = this.renderVals ? this.renderVals() : {}; return this.__tpl(vals || {}); }
  };

  window.dcMount = function (opts) {
    var tplEl = document.getElementById('dc-template');
    var tpl = compileChildren(tplEl.content.childNodes);
    var src = document.getElementById('dc-logic').textContent;
    var Component = new Function('React', 'DCLogic', src + '\n;return Component;')(React, window.DCLogic);
    Component.prototype.__tpl = function (vals) { return tpl(vals); };
    var mount = document.getElementById('dc-root');
    var render = function (key) { ReactDOM.render(h(Component, Object.assign({ key: key }, opts.props(render))), mount); };
    render(0);
  };
})();
