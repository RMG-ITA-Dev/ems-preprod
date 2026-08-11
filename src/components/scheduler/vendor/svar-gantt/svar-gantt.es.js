/*!
 * EMS Scheduler vendored bundle — SVAR React Gantt v2.7.1
 * (@svar-ui/react-gantt plus its bundled @svar-ui/* dependencies).
 * MIT License — Copyright (c) 2025 XB Software Sp. z o.o.
 * Embeds date-fns code shipped inside the SVAR dists
 * (MIT — Copyright (c) 2021 Sasha Koss and Lesha Koss).
 * See LICENSES/svar-react-gantt.txt and LICENSES/THIRD-PARTY-NOTICES.md.
 *
 * GENERATED FILE — DO NOT EDIT BY HAND.
 * Regenerate only via tools/vendor/svar-gantt/build.mjs
 * (transformations T1–T3 applied; see tools/vendor/svar-gantt/README.md).
 */
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// node_modules/@svar-ui/react-gantt/dist/index.es.js
import { jsx as a2, jsxs as ue4, Fragment as Pe2 } from "react/jsx-runtime";
import { createContext as Ot3, useContext as be4, useMemo as x2, useState as ce5, useCallback as A5, useRef as V6, useEffect as ie5, useLayoutEffect as at2, Fragment as $t3, forwardRef as Nt3, useImperativeHandle as Et2 } from "react";

// node_modules/@svar-ui/react-core/dist/index.es.js
import { jsx as r, jsxs as L, Fragment as Q } from "react/jsx-runtime";
import { createContext as fe, useContext as X, useState as O, useCallback as V, useRef as F, useEffect as J, useMemo as E, useLayoutEffect as he, memo as qe, useId as Ke, forwardRef as Xe, useImperativeHandle as et } from "react";

// node_modules/@svar-ui/react-core/node_modules/@svar-ui/lib-react/dist/index.js
import { useState, useRef, useEffect } from "react";

// node_modules/@svar-ui/react-core/node_modules/@svar-ui/lib-react/node_modules/@svar-ui/lib-dom/dist/index.js
function getEnv() {
  return {
    detect: () => true,
    addEvent: function(node, event, handler) {
      node.addEventListener(event, handler);
      return () => node.removeEventListener(event, handler);
    },
    addGlobalEvent: function(event, handler) {
      document.addEventListener(event, handler);
      return () => document.removeEventListener(event, handler);
    },
    getTopNode: function() {
      return window.document.body;
    }
  };
}
var env = getEnv();
var id2 = (/* @__PURE__ */ new Date()).valueOf();

// node_modules/@svar-ui/react-core/node_modules/@svar-ui/lib-react/dist/index.js
function useWritableProp(propValue) {
  const [value, setValue] = useState(propValue);
  const prevPropRef = useRef(propValue);
  useEffect(() => {
    if (prevPropRef.current !== propValue) {
      if (Array.isArray(prevPropRef.current) && Array.isArray(propValue) && prevPropRef.current.length === 0 && propValue.length === 0)
        return;
      prevPropRef.current = propValue;
      setValue(propValue);
    }
  }, [propValue]);
  return [value, setValue];
}
function snippet(name, arg) {
  if (typeof name === "function") {
    if (typeof arg === "object") {
      return name(arg);
    } else {
      return name();
    }
  }
  return name;
}

// node_modules/@svar-ui/lib-dom/dist/index.js
function locate2(el, attr = "data-id") {
  let node = el;
  if (!node.tagName && el.target)
    node = el.target;
  while (node) {
    if (node.getAttribute) {
      const id32 = node.getAttribute(attr);
      if (id32) return node;
    }
    node = node.parentNode;
  }
  return null;
}
function locateID(el, attr = "data-id") {
  const node = locate2(el, attr);
  if (node) {
    return getID(node, attr);
  }
  return null;
}
function getID(el, attr = "data-id") {
  const value = el.getAttribute(attr);
  if (!value) return null;
  return id3(value);
}
function setID(id32) {
  return typeof id32 === "string" ? ":" + id32 : id32;
}
function id3(value) {
  if (value.startsWith(":")) return value.substring(1);
  const t2 = value * 1;
  if (!isNaN(t2)) return t2;
  return value;
}
function getEnv2() {
  return {
    detect: () => true,
    addEvent: function(node, event, handler) {
      node.addEventListener(event, handler);
      return () => node.removeEventListener(event, handler);
    },
    addGlobalEvent: function(event, handler) {
      document.addEventListener(event, handler);
      return () => document.removeEventListener(event, handler);
    },
    getTopNode: function() {
      return window.document.body;
    }
  };
}
var env2 = getEnv2();
function setEnv(update) {
  Object.assign(env2, update);
}
function delegateEvent(node, handlers, event) {
  function handleEvent(ev) {
    const node2 = locate2(ev);
    if (!node2) return;
    const id32 = getID(node2);
    if (typeof handlers === "function") return handlers(id32, ev);
    let action;
    let test = ev.target;
    while (test != node2) {
      action = test.dataset ? test.dataset.action : null;
      if (action) {
        if (handlers[action]) {
          handlers[action](id32, ev);
          return;
        }
      }
      test = test.parentNode;
    }
    if (handlers[event]) handlers[event](id32, ev);
  }
  env2.addEvent(node, event, handleEvent);
}
function delegateClick(node, handlers) {
  delegateEvent(node, handlers, "click");
  if (handlers.dblclick) delegateEvent(node, handlers.dblclick, "dblclick");
}
function remove(items, node) {
  for (let i3 = items.length - 1; i3 >= 0; i3--) {
    if (items[i3] === node) {
      items.splice(i3, 1);
      break;
    }
  }
}
function isAncestorOfOther(node, target, index) {
  for (let i3 = 0; i3 < outsideListeners.length; i3++) {
    if (i3 === index) continue;
    const other = outsideListeners[i3];
    const p = other.props.parent?.();
    if (p && node.contains(p) && other.node.contains(target)) return true;
  }
  return false;
}
var activationDate = /* @__PURE__ */ new Date();
var skipNext = false;
var outsideHandlers = [];
var outsideListeners = [];
var handleOutsideClick = (event) => {
  const target = event.target;
  if (skipNext || !target.isConnected) {
    skipNext = false;
    return;
  }
  for (let i3 = outsideListeners.length - 1; i3 >= 0; i3--) {
    const { node, date, props } = outsideListeners[i3];
    if (date > activationDate) continue;
    if (!node.contains(target) && node !== target) {
      if (isAncestorOfOther(node, target, i3)) break;
      if (props.callback) props.callback(event);
      if (props.modal || event.defaultPrevented) break;
    }
  }
};
var handleMouseDown = (event) => {
  activationDate = /* @__PURE__ */ new Date();
  skipNext = true;
  for (let i3 = outsideListeners.length - 1; i3 >= 0; i3--) {
    const { node } = outsideListeners[i3];
    if (!node.contains(event.target) && node !== event.target) {
      skipNext = false;
      break;
    }
  }
};
function clickOutside(node, props) {
  if (!outsideHandlers.length) {
    outsideHandlers = [
      env2.addGlobalEvent("click", handleOutsideClick, node),
      env2.addGlobalEvent("contextmenu", handleOutsideClick, node),
      env2.addGlobalEvent("mousedown", handleMouseDown, node)
    ];
  }
  if (typeof props !== "object") {
    props = { callback: props };
  }
  const pack = { node, date: /* @__PURE__ */ new Date(), props };
  outsideListeners.push(pack);
  return {
    destroy() {
      remove(outsideListeners, pack);
      if (!outsideListeners.length) {
        outsideHandlers.forEach((e) => e());
        outsideHandlers = [];
      }
    }
  };
}
var isBottom = (mode) => mode.indexOf("bottom") !== -1;
var isLeft = (mode) => mode.indexOf("left") !== -1;
var isRight = (mode) => mode.indexOf("right") !== -1;
var isTop = (mode) => mode.indexOf("top") !== -1;
var isFit = (mode) => mode.indexOf("fit") !== -1;
var isOverlap = (mode) => mode.indexOf("overlap") !== -1;
var isCenter = (mode) => {
  return mode.split("-").every((v) => ["center", "fit"].indexOf(v) > -1);
};
var getAlign = (mode) => {
  const match = mode.match(/(start|center|end)/);
  return match ? match[0] : null;
};
function getMaxIndex(p, ap) {
  let zi = 0;
  const top = env2.getTopNode(p);
  while (p) {
    if (p === top) break;
    const pos2 = getComputedStyle(p)["position"];
    if (pos2 === "absolute" || pos2 === "relative" || pos2 === "fixed") {
      zi = parseInt(getComputedStyle(p)["zIndex"]) || 0;
    }
    p = p.parentNode;
    if (p === ap) break;
  }
  return zi;
}
var x;
var y;
var width;
var pos;
function calculatePosition(self, parent, at3 = "bottom", left = 0, top = 0) {
  if (!self) return null;
  x = left;
  y = top;
  width = "auto";
  let z4 = 0;
  let fixLeft = 0;
  let resultAt = at3;
  const body = getAbsParent(self);
  const cont = isOverlap(at3) ? env2.getTopNode(self) : body;
  if (!body) return null;
  const bodyRect = body.getBoundingClientRect();
  const selfRect = self.getBoundingClientRect();
  const contRect = cont.getBoundingClientRect();
  const contStyle = window.getComputedStyle(cont);
  const border = {
    left: 0,
    top: 0,
    bottom: 0,
    right: 0
  };
  for (const key in border) {
    const style = `border-${key}-width`;
    border[key] = parseFloat(contStyle.getPropertyValue(style));
  }
  if (parent) {
    const zi = getMaxIndex(parent, body);
    z4 = Math.max(zi + 1, 20);
  }
  if (parent) {
    pos = parent.getBoundingClientRect();
    if (isFit(at3)) width = pos.width + "px";
    if (at3 !== "point") {
      if (isCenter(at3)) {
        if (isFit(at3)) {
          x = 0;
        } else {
          x = contRect.width / 2;
          fixLeft = 1;
        }
        y = (contRect.height - selfRect.height) / 2;
      } else {
        const fix = isOverlap(at3) ? 0 : 1;
        x = isRight(at3) ? pos.right + fix : pos.left - fix;
        y = isBottom(at3) ? pos.bottom + 1 : pos.top;
        const align = getAlign(at3);
        if (align) {
          if (isRight(at3) || isLeft(at3)) {
            if (align === "center") y -= (selfRect.height - pos.height) / 2;
            else if (align === "end") y -= selfRect.height - pos.height;
          } else if (isBottom(at3) || isTop(at3)) {
            if (align === "center") x -= (selfRect.width - pos.width) / 2;
            else if (align === "end") x -= selfRect.width - pos.width;
            if (!isOverlap(at3)) x += 1;
          }
        }
      }
    }
  } else pos = { left, right: left, top, bottom: top };
  const isCorner = (isLeft(at3) || isRight(at3)) && (isBottom(at3) || isTop(at3));
  if (isLeft(at3)) {
    fixLeft = 2;
  }
  const dxL = x - selfRect.width - contRect.left;
  if (parent && isLeft(at3) && !isCorner && dxL < 0) {
    x = pos.right;
    fixLeft = 0;
    resultAt = resultAt.replace("left", "right");
  }
  const dxR = x + selfRect.width * (1 - fixLeft / 2) - contRect.right;
  if (dxR > 0) {
    if (!isRight(at3)) {
      x = contRect.right - border.right - selfRect.width;
    } else {
      const dx = pos.left - contRect.x - selfRect.width;
      if (parent && !isCorner && dx >= 0) {
        x = pos.left - selfRect.width;
        resultAt = resultAt.replace("right", "left");
      } else {
        x -= dxR + border.right;
      }
    }
  }
  if (fixLeft) {
    x = Math.round(x - selfRect.width * fixLeft / 2);
  }
  const needSwap = dxL < 0 || dxR > 0 || !isCorner;
  if (isTop(at3)) {
    y = pos.top - selfRect.height;
    if (parent && y < contRect.y && needSwap) {
      y = pos.bottom;
      resultAt = resultAt.replace("top", "bottom");
    }
  }
  const dy = y + selfRect.height - contRect.bottom;
  if (dy > 0) {
    if (parent && isBottom(at3) && needSwap) {
      y -= selfRect.height + pos.height + 1;
      resultAt = resultAt.replace("bottom", "top");
    } else {
      y -= dy + border.bottom;
    }
  }
  x -= bodyRect.left + border.left;
  y -= bodyRect.top + border.top;
  x = (isOverlap(at3) ? x : Math.max(x, 0)) + cont.scrollLeft;
  y = (isOverlap(at3) ? y : Math.max(y, 0)) + cont.scrollTop;
  width = width || "auto";
  return { at: resultAt, x, y, z: z4, width };
}
function getAbsParent(el) {
  const top = env2.getTopNode(el);
  if (el) el = el.parentElement;
  while (el) {
    const pos2 = getComputedStyle(el)["position"];
    if (el === top || pos2 === "relative" || pos2 === "absolute" || pos2 === "fixed")
      return el;
    el = el.parentNode;
  }
  return null;
}
function getPopupParents(node) {
  const popupNodes = [];
  let el = node;
  const top = env2.getTopNode(node);
  while (el && el !== top && !el.getAttribute("data-wx-portal-root")) {
    if (getComputedStyle(el)["position"] === "absolute") popupNodes.push(el);
    el = el.parentNode;
  }
  return popupNodes;
}
var id22 = (/* @__PURE__ */ new Date()).valueOf();
function uid() {
  id22 += 1;
  return id22;
}
function toFixed(num) {
  if (num < 10) return "0" + num;
  return num.toString();
}
function toFixedMs(num) {
  const temp = toFixed(num);
  return temp.length == 2 ? "0" + temp : temp;
}
function getDuodecade(year) {
  const start = Math.floor(year / 11) * 11;
  return {
    start,
    end: start + 11
  };
}
function getWeekNumber(ndate) {
  const nday = (ndate.getDay() + 6) % 7;
  const pivot = new Date(ndate.valueOf());
  pivot.setDate(ndate.getDate() + (3 - nday));
  pivot.setHours(0, 0, 0, 0);
  const jan1 = new Date(pivot.getFullYear(), 0, 1);
  const ordinal = Math.round((pivot.getTime() - jan1.getTime()) / 864e5);
  return 1 + Math.floor(ordinal / 7);
}
var emptyAmPm = ["", ""];
function date2str(mask, date, locale2) {
  switch (mask) {
    case "%d":
      return toFixed(date.getDate());
    case "%m":
      return toFixed(date.getMonth() + 1);
    case "%j":
      return date.getDate();
    case "%n":
      return date.getMonth() + 1;
    case "%y":
      return toFixed(date.getFullYear() % 100);
    case "%Y":
      return date.getFullYear();
    case "%D":
      return locale2.dayShort[date.getDay()];
    case "%l":
      return locale2.dayFull[date.getDay()];
    case "%M":
      return locale2.monthShort[date.getMonth()];
    case "%F":
      return locale2.monthFull[date.getMonth()];
    case "%h":
      return toFixed((date.getHours() + 11) % 12 + 1);
    case "%g":
      return (date.getHours() + 11) % 12 + 1;
    case "%G":
      return date.getHours();
    case "%H":
      return toFixed(date.getHours());
    case "%i":
      return toFixed(date.getMinutes());
    case "%a":
      return ((date.getHours() > 11 ? locale2.pm : locale2.am) || emptyAmPm)[0];
    case "%A":
      return ((date.getHours() > 11 ? locale2.pm : locale2.am) || emptyAmPm)[1];
    case "%s":
      return toFixed(date.getSeconds());
    case "%S":
      return toFixedMs(date.getMilliseconds());
    case "%W":
      return toFixed(getWeekNumber(date));
    case "%w": {
      const ws2 = locale2.weekStart ?? 1;
      if (ws2 === 1) return toFixed(getWeekNumber(date));
      const dayInWeek = (date.getDay() - ws2 + 7) % 7;
      const monInWeek = (1 - ws2 + 7) % 7;
      const monday = new Date(date.valueOf());
      monday.setDate(date.getDate() + (monInWeek - dayInWeek));
      return toFixed(getWeekNumber(monday));
    }
    case "%c": {
      let str = date.getFullYear() + "";
      str += "-" + toFixed(date.getMonth() + 1);
      str += "-" + toFixed(date.getDate());
      str += "T";
      str += toFixed(date.getHours());
      str += ":" + toFixed(date.getMinutes());
      str += ":" + toFixed(date.getSeconds());
      return str;
    }
    case "%Q":
      return Math.floor(date.getMonth() / 3) + 1;
    default:
      return mask;
  }
}
var formatFlags = /%[a-zA-Z]/g;
function dateToString(format, locale2) {
  if (typeof format == "function") return format;
  return function(date) {
    if (!date) return "";
    if (!date.getMonth) date = new Date(date);
    return format.replace(
      formatFlags,
      (s) => date2str(s, date, locale2)
    );
  };
}
function isObject(a3) {
  return a3 && typeof a3 === "object" && !Array.isArray(a3);
}
function extend(a3, b4) {
  for (const key in b4) {
    const from = b4[key];
    if (isObject(a3[key]) && isObject(from)) {
      a3[key] = extend(
        { ...a3[key] },
        b4[key]
      );
    } else {
      a3[key] = b4[key];
    }
  }
  return a3;
}
function locale(words) {
  return {
    getGroup(group) {
      const block = words[group];
      return (key) => {
        return block ? block[key] || key : key;
      };
    },
    getRaw() {
      return words;
    },
    extend(values, optional) {
      if (!values) return this;
      let data2;
      if (optional) {
        data2 = extend({ ...values }, words);
      } else {
        data2 = extend({ ...words }, values);
      }
      return locale(data2);
    }
  };
}

// node_modules/@svar-ui/react-core/dist/index.es.js
import { createPortal as lt } from "react-dom";

// node_modules/@svar-ui/core-locales/locales/en.js
var lang = "en-US";
var calendar = {
  monthFull: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ],
  monthShort: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ],
  dayFull: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ],
  dayShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  hours: "Hours",
  minutes: "Minutes",
  done: "Done",
  clear: "Clear",
  today: "Today",
  am: ["am", "AM"],
  pm: ["pm", "PM"],
  weekStart: 0,
  clockFormat: 24
};
var core = {
  ok: "OK",
  cancel: "Cancel",
  select: "Select",
  "No data": "No data",
  "Rows per page": "Rows per page",
  "Total pages": "Total pages"
};
var formats = {
  timeFormat: "%H:%i",
  dateFormat: "%m/%d/%Y",
  monthYearFormat: "%F %Y",
  yearFormat: "%Y"
};
var data = {
  core,
  calendar,
  formats,
  lang
};
var en_default = data;

// node_modules/@svar-ui/react-core/dist/index.es.js
var ie = fe("");
var Ge = fe({});
var K = fe(null);
var ue = fe(null);
var Qt = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  fieldId: ue,
  helpers: Ge,
  i18n: K,
  theme: ie
}, Symbol.toStringTag, { value: "Module" }));
function te(e) {
  const t2 = X(ue), [n] = O(() => e || t2 || uid());
  return n;
}
function zt({
  value: e = "",
  id: t2,
  placeholder: n = "",
  title: c = "",
  tooltip: l,
  disabled: i3 = false,
  error: a3 = false,
  readonly: o = false,
  css: s = "",
  onChange: u
}) {
  const d = te(t2), [p, f] = useWritableProp(e), h = V(
    (x3) => {
      const w = x3.target.value;
      f(w), u && u({ value: w, input: true });
    },
    [u]
  ), v = V(
    (x3) => {
      const w = x3.target.value;
      f(w), u && u({ value: w });
    },
    [u]
  ), k2 = F(null);
  return J(() => {
    const x3 = v, w = k2.current;
    return w.addEventListener("change", x3), () => {
      w && w.removeEventListener("change", x3);
    };
  }, [v]), /* @__PURE__ */ r(
    "textarea",
    {
      className: `wx-3yFVAC wx-textarea ${s} ${a3 ? "wx-error" : ""}`,
      id: d,
      disabled: i3,
      placeholder: n,
      readOnly: o,
      title: c,
      value: p,
      onInput: h,
      ref: k2,
      "data-tooltip-text": l
    }
  );
}
function le({
  type: e = "",
  css: t2 = "",
  icon: n = "",
  disabled: c = false,
  title: l = "",
  tooltip: i3,
  text: a3 = "",
  children: o,
  onClick: s
}) {
  const u = E(() => {
    let p = e ? e.split(" ").filter((f) => f !== "").map((f) => "wx-" + f).join(" ") : "";
    return t2 + (t2 ? " " : "") + p;
  }, [e, t2]), d = (p) => {
    s && s(p);
  };
  return /* @__PURE__ */ L(
    "button",
    {
      title: l,
      className: `wx-2ZWgb4 wx-button ${u} ${n && !o ? "wx-icon" : ""}`,
      disabled: c,
      onClick: d,
      "data-tooltip-text": i3,
      children: [
        n && /* @__PURE__ */ r("i", { className: "wx-2ZWgb4 " + n }),
        o || a3 || " "
      ]
    }
  );
}
function _e({
  id: e,
  label: t2 = "",
  inputValue: n = "",
  value: c = false,
  onChange: l,
  disabled: i3 = false,
  css: a3 = ""
}) {
  const o = te(e), [s, u] = useWritableProp(c), d = ({ target: p }) => {
    const f = p.checked;
    u(f), l && l({ value: f, inputValue: n });
  };
  return /* @__PURE__ */ L("div", { className: `wx-2IvefP wx-checkbox ${a3}`, children: [
    /* @__PURE__ */ r(
      "input",
      {
        type: "checkbox",
        id: o,
        disabled: i3,
        className: "wx-2IvefP wx-check",
        checked: s,
        value: n,
        onChange: d
      }
    ),
    /* @__PURE__ */ L("label", { htmlFor: o, className: "wx-2IvefP wx-label", children: [
      /* @__PURE__ */ r("span", { className: "wx-2IvefP wx-before" }),
      t2 && /* @__PURE__ */ r("span", { className: "wx-2IvefP wx-after", children: t2 })
    ] })
  ] });
}
function Ue({ theme: e = "", target: t2, children: n }) {
  const c = F(null), l = F(null), [i3, a3] = O(null);
  c.current || (c.current = document.createElement("div"));
  const o = X(ie);
  return J(() => {
    a3(
      t2 || st(l.current) || env2.getTopNode(l.current)
    );
  }, [l.current]), /* @__PURE__ */ L(Q, { children: [
    /* @__PURE__ */ r("span", { ref: l, style: { display: "none" } }),
    l.current && i3 ? lt(
      /* @__PURE__ */ r(
        "div",
        {
          className: `wx-3ZWsT0 wx-${e || o}-theme`,
          children: n
        }
      ),
      i3
    ) : null
  ] });
}
function st(e) {
  const t2 = env2.getTopNode(e);
  for (; e && e !== t2 && !e.getAttribute("data-wx-portal-root"); )
    e = e.parentNode;
  return e;
}
function ct({
  left: e = 0,
  top: t2 = 0,
  at: n = "bottom",
  parent: c = null,
  width: l = "auto",
  css: i3 = "",
  onCancel: a3,
  children: o,
  trackScroll: s = false
}) {
  const [u, d] = O(0), [p, f] = O(0), [h, v] = O("auto"), [k2, x3] = O(false), w = F(null), m = F(null), N3 = F(a3);
  J(() => {
    N3.current = a3;
  }, [a3]);
  function $2(b4) {
    return c && (l + "").indexOf("%") > -1 ? l.replace(/(\d+)%/, (g, H3) => (H3 = H3 * c.offsetWidth / 100 + "px", l.replace(g, H3))) : l && l !== "auto" ? l : b4;
  }
  const y4 = V(() => {
    if (!w.current) return;
    const b4 = calculatePosition(w.current, c, n, e, t2);
    b4 && (d(b4.x), f(b4.y), v($2(b4.width)));
  }, [w, c, n, e, t2, l]);
  return he(() => {
    const b4 = (H3) => {
      N3.current && H3.target !== m.current && w.current && !w.current.contains(H3.target) && N3.current(H3);
    };
    let g;
    return requestAnimationFrame(() => {
      y4(), x3(true), s && w.current && (m.current = getAbsParent(w.current), m.current && m.current.addEventListener("scroll", b4, true)), c && (g = new ResizeObserver(y4), g.observe(c));
    }), () => {
      s && m.current && m.current.removeEventListener("scroll", b4, true), g?.disconnect();
    };
  }, []), he(() => {
    y4();
  }, [c, n, e, t2]), J(() => {
    const b4 = (g) => {
      N3.current && N3.current(g);
    };
    if (w.current)
      return clickOutside(w.current, { callback: b4, parent: () => c }).destroy;
  }, [c]), /* @__PURE__ */ r(
    "div",
    {
      ref: w,
      className: ["wx-37M6Fj", "wx-popup", i3].filter(Boolean).join(" "),
      style: {
        position: "absolute",
        visibility: k2 ? "visible" : "hidden",
        top: p + "px",
        left: u + "px",
        width: h
      },
      children: o
    }
  );
}
function ot({
  position: e = "bottom",
  align: t2 = "start",
  autoFit: n = true,
  onCancel: c = null,
  width: l = "100%",
  css: i3 = "",
  children: a3
}) {
  const o = F(null), [s, u] = O(e), [d, p] = O(t2), f = F(c);
  return J(() => {
    f.current = c;
  }, [c]), J(() => {
    if (n) {
      const h = o.current;
      if (h) {
        const v = h.getBoundingClientRect(), k2 = document.body.getBoundingClientRect();
        v.right >= k2.right && p("end"), v.bottom >= k2.bottom && u("top");
      }
    }
  }, []), J(() => {
    if (o.current) {
      const h = (v) => {
        f.current && f.current(v);
      };
      return clickOutside(o.current, h).destroy;
    }
  }, []), /* @__PURE__ */ r(
    "div",
    {
      ref: o,
      className: [
        "wx-dropdown",
        `wx-${s}-${d}`,
        i3 || "",
        "wx-aaaVytZW"
      ].filter(Boolean).join(" "),
      style: { width: l },
      children: a3
    }
  );
}
function se({
  position: e = "bottom",
  align: t2 = "start",
  autoFit: n = true,
  inline: c = false,
  onCancel: l,
  width: i3 = "100%",
  children: a3,
  ...o
}) {
  const [s, u] = O(void 0), d = F(null), p = E(() => `${e}-${t2}`, [e, t2]);
  return he(() => {
    d.current && u(d.current.parentNode);
  }, []), /* @__PURE__ */ L(Q, { children: [
    s && (c ? /* @__PURE__ */ r(
      ot,
      {
        onCancel: l,
        position: e,
        align: t2,
        autoFit: n,
        width: i3,
        ...o,
        children: a3
      }
    ) : /* @__PURE__ */ r(Ue, { children: /* @__PURE__ */ r(ct, { parent: s, at: p, onCancel: l, width: i3, ...o, children: a3 }) })),
    /* @__PURE__ */ r("span", { ref: d, className: "wx-portal-node wx-32GZ52" })
  ] });
}
function ne() {
  return locale(en_default);
}
function dt() {
  let e = null, t2 = false, n = false, c, l, i3, a3;
  const o = (h, v, k2, x3, w) => {
    c = h, l = v, i3 = k2, a3 = x3, n = w;
  }, s = (h) => {
    e = h, t2 = e !== null, i3(e);
  }, u = (h, v) => {
    if (!n && h !== null && c) {
      const k2 = c.querySelectorAll(".wx-list > .wx-item")[h];
      k2 && (k2.scrollIntoView({ block: "nearest" }), v && v.preventDefault());
    }
  }, d = (h, v) => {
    const k2 = h === null ? null : Math.max(0, Math.min(e + h, l.length - 1));
    k2 !== e && (s(k2), c ? u(k2, v) : requestAnimationFrame(() => u(k2, v)));
  };
  return { move: (h) => {
    const v = locateID(h), k2 = l.findIndex((x3) => x3.id === v);
    k2 !== e && s(k2);
  }, keydown: (h, v) => {
    switch (h.code) {
      case "Enter":
        t2 ? a3() : s(0);
        break;
      case "Space":
        t2 || s(0);
        break;
      case "Escape":
        i3(e = null);
        break;
      case "Tab":
        i3(e = null);
        break;
      case "ArrowDown":
        d(t2 ? 1 : v || 0, h);
        break;
      case "ArrowUp":
        d(t2 ? -1 : v || 0, h);
        break;
    }
  }, init: o, navigate: d };
}
var Re = 10;
var ft = qe(function({ data: t2, checkboxes: n, itemTemplate: c, value: l }) {
  return /* @__PURE__ */ L(Q, { children: [
    n && /* @__PURE__ */ r(
      _e,
      {
        id: t2.id,
        css: "wx-list-checkbox",
        value: l && l.includes(t2.id)
      }
    ),
    c ? snippet(c, { option: t2 }) : t2.label
  ] });
});
function Me({
  visibleItems: e,
  visibleRange: t2,
  navIndex: n,
  checkboxes: c,
  itemTemplate: l,
  value: i3,
  measureRefCallback: a3
}) {
  return e.map((o, s) => {
    const u = t2.start + s;
    return /* @__PURE__ */ r(
      "div",
      {
        ref: s === 0 ? a3 : void 0,
        className: `wx-233fr7 wx-item ${u === n ? "wx-focus" : ""}`,
        "data-id": o.id,
        children: /* @__PURE__ */ r(
          ft,
          {
            data: o,
            checkboxes: c,
            itemTemplate: l,
            value: i3
          }
        )
      },
      o.id
    );
  });
}
function Ne({
  items: e = [],
  children: t2,
  onSelect: n,
  onReady: c,
  virtualized: l = false,
  checkboxes: i3,
  multiselect: a3,
  value: o,
  ...s
}) {
  const u = F(), d = F(false), p = F(dt()), [f, h] = O(null), v = F(f), [k2, x3] = O(0), [w, m] = O(24), N3 = F(false), $2 = (X(K) || ne()).getGroup("core"), y4 = F(e);
  J(() => {
    y4.current = e;
  }, [e]);
  const b4 = F(o);
  J(() => {
    b4.current = o;
  }, [o]);
  const g = F(0);
  J(() => {
    g.current = w;
  }, [w]);
  const H3 = V((M2) => {
    M2 && M2.stopPropagation();
    const D4 = y4.current, A6 = b4.current, ee5 = v.current;
    let z4;
    const q4 = D4[ee5]?.id;
    a3 ? A6 && A6.includes(q4) ? z4 = A6.filter((we3) => we3 !== q4) : z4 = [...A6 || [], q4] : z4 = q4, n && n({ id: z4 });
  }, [a3, n]), C4 = F(H3);
  J(() => {
    C4.current = H3;
  }, [H3]);
  const R4 = V((M2) => {
    if (u.current) {
      let D4 = M2 * g.current - u.current.clientHeight + g.current;
      x3(D4), u.current.scrollTop = D4;
    }
  }, [g.current]), Y4 = V(
    (M2) => {
      u.current = M2, l && (M2 && !d.current && v.current !== null && requestAnimationFrame(() => {
        u.current && (R4(v.current), d.current = true);
      }), M2 || (d.current = false));
    },
    [R4]
  ), G3 = V((M2) => {
    if (!M2 || N3.current) return;
    const D4 = M2.getBoundingClientRect().height;
    D4 && (m(D4), g.current = D4, N3.current = true);
  }, []);
  J(() => {
    p.current.init(
      u.current,
      e,
      (M2) => {
        h(M2), v.current = M2;
      },
      (M2) => C4.current(M2),
      l
    );
  }, [e, u.current, l]), J(() => {
    const M2 = (A6, ee5) => {
      p.current.navigate(A6, ee5), R4(v.current);
    }, D4 = (A6, ee5) => {
      const z4 = v.current, q4 = y4.current;
      if (z4 !== 0 && z4 !== q4.length - 1 && (A6.key === "ArrowDown" || A6.key === "ArrowUp") && A6.preventDefault(), p.current.keydown(A6, ee5), u.current) {
        const we3 = u.current.scrollTop <= v.current * g.current, ze3 = u.current.scrollTop + u.current.clientHeight >= v.current * g.current + g.current;
        we3 ? ze3 || R4(v.current) : (u.current.scrollTop = v.current * g.current, x3(u.current.scrollTop));
      }
    };
    c && c({
      navigate: l ? M2 : p.current.navigate,
      keydown: l ? D4 : p.current.keydown,
      move: p.current.move
    });
  }, []);
  const W5 = F(0), S4 = F(e);
  S4.current !== e && (S4.current = e, W5.current += 1);
  const B4 = V(() => {
    p.current.navigate(null);
  }, [p]), _4 = V((M2) => {
    l && x3(M2.target.scrollTop);
  }, [l]), Z3 = E(
    () => Math.ceil((u.current?.clientHeight || 0) / w),
    [w, k2]
  ), P4 = E(() => {
    if (!l) return { start: 0, end: e.length };
    if (!e.length) return { start: 0, end: 0 };
    const M2 = Math.floor(k2 / w), D4 = M2 + Z3;
    return {
      start: Math.max(0, M2 - Re),
      end: Math.min(e.length, D4 + Re)
    };
  }, [l, e, k2, w, Z3]), j4 = E(() => {
    if (!l) return e;
    const { start: M2, end: D4 } = P4;
    return e.slice(M2, D4).map((A6) => ({
      ...A6
    }));
  }, [l, e, P4]), I6 = P4.start * w, T4 = e.length * w;
  return J(() => {
    l && x3(0);
  }, [e, l]), J(() => {
    f === null && (d.current = false);
  }, [f]), f === null ? null : /* @__PURE__ */ r(se, { onCancel: B4, ...s, children: /* @__PURE__ */ r(
    "div",
    {
      className: "wx-233fr7 wx-list",
      ref: Y4,
      onClick: H3,
      onMouseMove: p.current.move,
      onScroll: _4,
      children: e.length ? l ? /* @__PURE__ */ r(
        "div",
        {
          className: "wx-233fr7 wx-list-wrapper",
          style: { height: `${T4}px` },
          children: /* @__PURE__ */ r(
            "div",
            {
              className: "wx-233fr7 wx-list-content",
              style: { transform: `translateY(${I6}px)` },
              children: /* @__PURE__ */ r(
                Me,
                {
                  visibleRange: P4,
                  visibleItems: j4,
                  navIndex: f,
                  measureRefCallback: G3,
                  checkboxes: i3,
                  itemTemplate: t2,
                  value: o
                }
              )
            }
          )
        }
      ) : /* @__PURE__ */ r(
        Me,
        {
          visibleRange: P4,
          visibleItems: j4,
          navIndex: f,
          measureRefCallback: G3,
          checkboxes: i3,
          itemTemplate: t2,
          value: o
        }
      ) : /* @__PURE__ */ r("div", { className: "wx-233fr7 wx-no-data", children: $2("No data") })
    }
  ) }, W5.current);
}
function ke({
  value: e = "",
  id: t2,
  readonly: n = false,
  focus: c = false,
  select: l = false,
  type: i3 = "text",
  placeholder: a3 = "",
  disabled: o = false,
  error: s = false,
  title: u = "",
  tooltip: d,
  css: p = "",
  icon: f = "",
  clear: h = false,
  onChange: v
}) {
  const k2 = te(t2), [x3, w] = useWritableProp(e), m = F(null), N3 = E(
    () => f && p.indexOf("wx-icon-left") === -1 ? "wx-icon-right " + p : p,
    [f, p]
  ), $2 = E(
    () => f && p.indexOf("wx-icon-left") !== -1,
    [f, p]
  );
  J(() => {
    const C4 = setTimeout(() => {
      c && m.current && m.current.focus(), l && m.current && m.current.select();
    }, 1);
    return () => clearTimeout(C4);
  }, [c, l]);
  const y4 = V(
    (C4) => {
      const R4 = C4.target.value;
      w(R4), v && v({ value: R4, input: true });
    },
    [v]
  ), b4 = V(
    (C4) => v && v({ value: C4.target.value }),
    [v]
  );
  function g(C4) {
    C4.stopPropagation(), w(""), v && v({ value: "" });
  }
  let H3 = i3;
  return i3 !== "password" && i3 !== "number" && (H3 = "text"), J(() => {
    const C4 = b4, R4 = m.current;
    return R4.addEventListener("change", C4), () => {
      R4 && R4.removeEventListener("change", C4);
    };
  }, [b4]), /* @__PURE__ */ L(
    "div",
    {
      className: `wx-hQ64J4 wx-text ${N3} ${s ? "wx-error" : ""} ${o ? "wx-disabled" : ""} ${h ? "wx-clear" : ""}`,
      "data-tooltip-text": d,
      children: [
        /* @__PURE__ */ r(
          "input",
          {
            className: "wx-hQ64J4 wx-input",
            ref: m,
            id: k2,
            readOnly: n,
            disabled: o,
            placeholder: a3,
            type: H3,
            title: u,
            value: x3,
            onInput: y4
          }
        ),
        h && !o && x3 ? /* @__PURE__ */ L(Q, { children: [
          /* @__PURE__ */ r("i", { className: "wx-hQ64J4 wx-icon wxi-close", onClick: g }),
          $2 && /* @__PURE__ */ r("i", { className: `wx-hQ64J4 wx-icon ${f}` })
        ] }) : f ? /* @__PURE__ */ r("i", { className: `wx-hQ64J4 wx-icon ${f}` }) : null
      ]
    }
  );
}
function wt({ date: e, type: t2, part: n, onShift: c }) {
  const { calendar: l, formats: i3 } = X(K).getRaw(), a3 = e.getFullYear(), o = E(() => {
    switch (t2) {
      case "month":
        return dateToString(i3.monthYearFormat, l)(e);
      case "year":
        return dateToString(i3.yearFormat, l)(e);
      case "duodecade": {
        const { start: u, end: d } = getDuodecade(a3), p = dateToString(i3.yearFormat, l);
        return `${p(new Date(u, 0, 1))} - ${p(new Date(d, 11, 31))}`;
      }
      default:
        return "";
    }
  }, [e, t2, a3, l, i3]);
  function s() {
    c && c({ diff: 0, type: t2 });
  }
  return /* @__PURE__ */ L("div", { className: "wx-8HQVQV wx-header", children: [
    n !== "right" ? /* @__PURE__ */ r(
      "i",
      {
        className: "wx-8HQVQV wx-pager wxi-angle-left",
        onClick: () => c && c({ diff: -1, type: t2 })
      }
    ) : /* @__PURE__ */ r("span", { className: "wx-8HQVQV wx-spacer" }),
    /* @__PURE__ */ r("span", { className: "wx-8HQVQV wx-label", onClick: s, children: o }),
    n !== "left" ? /* @__PURE__ */ r(
      "i",
      {
        className: "wx-8HQVQV wx-pager wxi-angle-right",
        onClick: () => c && c({ diff: 1, type: t2 })
      }
    ) : /* @__PURE__ */ r("span", { className: "wx-8HQVQV wx-spacer" })
  ] });
}
function ye({ onClick: e, children: t2 }) {
  return /* @__PURE__ */ r("button", { className: "wx-3s8W4d wx-button", onClick: e, children: t2 });
}
function xt({
  value: e,
  current: t2,
  part: n = "",
  markers: c = null,
  css: l = "",
  onCancel: i3,
  onChange: a3
}) {
  const o = (X(K) || ne()).getRaw().calendar, s = (o.weekStart || 7) % 7, u = o.dayShort.slice(s).concat(o.dayShort.slice(0, s)), d = (y4, b4, g) => new Date(
    y4.getFullYear(),
    y4.getMonth() + (b4 || 0),
    y4.getDate() + (g || 0)
  );
  let p = n !== "normal";
  function f(y4) {
    const b4 = y4.getDay();
    return b4 === 0 || b4 === 6;
  }
  function h() {
    const y4 = d(t2, 0, 1 - t2.getDate());
    return y4.setDate(y4.getDate() - (y4.getDay() - (s - 7)) % 7), y4;
  }
  function v() {
    const y4 = d(t2, 1, -t2.getDate());
    return y4.setDate(y4.getDate() + (6 - y4.getDay() + s) % 7), y4;
  }
  const k2 = F(0);
  function x3(y4, b4) {
    b4.timeStamp !== k2.current && (k2.current = b4.timeStamp, b4.stopPropagation(), a3 && a3(new Date(y4)), i3 && i3());
  }
  const w = E(() => n == "normal" ? [e ? d(e).valueOf() : 0] : e ? [
    e.start ? d(e.start).valueOf() : 0,
    e.end ? d(e.end).valueOf() : 0
  ] : [0, 0], [n, e]), m = E(() => {
    const y4 = h(), b4 = v(), g = t2.getMonth();
    let H3 = [];
    for (let C4 = y4; C4 <= b4; C4.setDate(C4.getDate() + 1)) {
      const R4 = {
        day: C4.getDate(),
        in: C4.getMonth() === g,
        date: C4.valueOf()
      };
      let Y4 = "";
      if (Y4 += R4.in ? "" : " wx-inactive", Y4 += w.indexOf(R4.date) > -1 ? " wx-selected" : "", p) {
        const G3 = R4.date == w[0], W5 = R4.date == w[1];
        G3 && !W5 ? Y4 += " wx-left" : W5 && !G3 && (Y4 += " wx-right"), R4.date > w[0] && R4.date < w[1] && (Y4 += " wx-inrange");
      }
      if (Y4 += f(C4) ? " wx-weekend" : "", c) {
        const G3 = c(C4);
        G3 && (Y4 += " " + G3);
      }
      H3.push({ ...R4, css: Y4 });
    }
    return H3;
  }, [t2, w, p, c]), N3 = F(null);
  let $2 = F({});
  return $2.current.click = x3, J(() => {
    delegateClick(N3.current, $2.current);
  }, []), /* @__PURE__ */ L("div", { className: `wx-398RBS wx-month ${l}`, children: [
    /* @__PURE__ */ r("div", { className: "wx-398RBS wx-weekdays", children: u.map((y4) => /* @__PURE__ */ r("div", { className: "wx-398RBS wx-weekday", children: y4 }, y4)) }),
    /* @__PURE__ */ r("div", { className: "wx-398RBS wx-days", ref: N3, children: m.map((y4) => /* @__PURE__ */ r(
      "div",
      {
        className: `wx-398RBS wx-day ${y4.css} ${y4.in ? "" : "wx-out"}`,
        "data-id": y4.date,
        children: y4.day
      },
      y4.date
    )) })
  ] });
}
function mt({
  value: e,
  current: t2,
  part: n,
  onCancel: c,
  onChange: l,
  onShift: i3
}) {
  const a3 = F(/* @__PURE__ */ new Date()), [o, s] = useWritableProp(e || a3.current), [u, d] = useWritableProp(t2 || a3.current), p = X(K).getRaw().calendar, f = p.monthShort || [], h = E(() => u.getMonth(), [u]), v = V(
    (w, m) => {
      if (w != null) {
        m.stopPropagation();
        const N3 = new Date(u);
        N3.setMonth(w), d(N3), i3 && i3({ current: N3 });
      }
      n === "normal" && s(new Date(u)), c && c();
    },
    [u, n, i3, c]
  ), k2 = V(() => {
    const w = new Date(Ze(o, n) || u);
    w.setMonth(u.getMonth()), w.setFullYear(u.getFullYear()), l && l(w);
  }, [o, u, n, l]), x3 = V(
    (w) => {
      const m = w.target.closest("[data-id]");
      if (m) {
        const N3 = parseInt(m.getAttribute("data-id"), 10);
        v(N3, w);
      }
    },
    [v]
  );
  return /* @__PURE__ */ L(Q, { children: [
    /* @__PURE__ */ r("div", { className: "wx-34U8T8 wx-months", onClick: x3, children: f.map((w, m) => /* @__PURE__ */ r(
      "div",
      {
        className: "wx-34U8T8 wx-month" + (h === m ? " wx-current" : ""),
        "data-id": m,
        children: w
      },
      m
    )) }),
    /* @__PURE__ */ r("div", { className: "wx-34U8T8 wx-buttons", children: /* @__PURE__ */ r(ye, { onClick: k2, children: p.done }) })
  ] });
}
var xe = "wx-1XEF33";
var ht = ({ value: e, current: t2, onCancel: n, onChange: c, onShift: l, part: i3 }) => {
  const a3 = X(K).getRaw().calendar, [o, s] = useWritableProp(t2), [u, d] = useWritableProp(e), p = E(() => o.getFullYear(), [o]), f = E(() => {
    const { start: w, end: m } = getDuodecade(p), N3 = [];
    for (let $2 = w; $2 <= m; ++$2)
      N3.push($2);
    return N3;
  }, [p]), h = {
    click: v
  };
  function v(w, m) {
    if (w) {
      m.stopPropagation();
      const N3 = new Date(o);
      N3.setFullYear(w), s(N3), l && l({ current: N3 });
    }
    i3 === "normal" && d(new Date(o)), n && n();
  }
  function k2() {
    const w = new Date(Ze(u, i3) || o);
    w.setFullYear(o.getFullYear()), c && c(w);
  }
  const x3 = F(null);
  return J(() => {
    x3.current && delegateClick(x3.current, h);
  }, []), /* @__PURE__ */ L(Q, { children: [
    /* @__PURE__ */ r("div", { className: xe + " wx-years", ref: x3, children: f.map((w, m) => /* @__PURE__ */ r(
      "div",
      {
        className: xe + ` wx-year ${p == w ? "wx-current" : ""} ${m === 0 ? "wx-prev-decade" : ""} ${m === 11 ? "wx-next-decade" : ""}`,
        "data-id": w,
        children: w
      },
      m
    )) }),
    /* @__PURE__ */ r("div", { className: xe + " wx-buttons", children: /* @__PURE__ */ r(ye, { onClick: k2, children: a3.done }) })
  ] });
};
var Ie = {
  month: {
    component: xt,
    next: vt,
    prev: pt
  },
  year: {
    component: mt,
    next: Nt,
    prev: gt
  },
  duodecade: {
    component: ht,
    next: yt,
    prev: kt
  }
};
function pt(e) {
  return e = new Date(e), e.setMonth(e.getMonth() - 1), e;
}
function vt(e) {
  return e = new Date(e), e.setMonth(e.getMonth() + 1), e;
}
function gt(e) {
  return e = new Date(e), e.setFullYear(e.getFullYear() - 1), e;
}
function Nt(e) {
  return e = new Date(e), e.setFullYear(e.getFullYear() + 1), e;
}
function kt(e) {
  return e = new Date(e), e.setFullYear(e.getFullYear() - 10), e;
}
function yt(e) {
  return e = new Date(e), e.setFullYear(e.getFullYear() + 10), e;
}
function Ze(e, t2) {
  let n;
  if (t2 === "normal") n = e;
  else {
    const { start: c, end: l } = e;
    t2 === "left" ? n = c : t2 == "right" ? n = l : n = c && l;
  }
  return n;
}
var bt = ["clear", "today"];
function Dt(e) {
  if (e === "done") return -1;
  if (e === "clear") return null;
  if (e === "today") return /* @__PURE__ */ new Date();
}
function de({
  value: e,
  current: t2,
  onCurrentChange: n,
  part: c = "normal",
  markers: l = null,
  buttons: i3,
  css: a3 = "",
  onShift: o,
  onChange: s
}) {
  const u = X(K).getGroup("calendar"), [d, p] = O("month"), f = Array.isArray(i3) ? i3 : i3 ? bt : [], h = (m, N3) => {
    m.preventDefault(), s && s({ value: N3 });
  }, v = () => {
    d === "duodecade" ? p("year") : d === "year" && p("month");
  }, k2 = (m) => {
    const { diff: N3, current: $2 } = m;
    if (N3 === 0) {
      d === "month" ? p("year") : d === "year" && p("duodecade");
      return;
    }
    if (N3) {
      const y4 = Ie[d];
      n(N3 > 0 ? y4.next(t2) : y4.prev(t2));
    } else $2 && n($2);
    o && o();
  }, x3 = (m) => {
    p("month"), s && s({ select: true, value: m });
  }, w = E(() => Ie[d].component, [d]);
  return /* @__PURE__ */ r(
    "div",
    {
      className: `wx-2Gr4AS wx-calendar ${c !== "normal" && c !== "both" ? "wx-part" : ""} ${a3}`,
      children: /* @__PURE__ */ L("div", { className: "wx-2Gr4AS wx-wrap", children: [
        /* @__PURE__ */ r(wt, { date: t2, part: c, type: d, onShift: k2 }),
        /* @__PURE__ */ L("div", { children: [
          /* @__PURE__ */ r(
            w,
            {
              value: e,
              current: t2,
              onCurrentChange: n,
              part: c,
              markers: l,
              onCancel: v,
              onChange: x3,
              onShift: k2
            }
          ),
          d === "month" && f.length > 0 && /* @__PURE__ */ r("div", { className: "wx-2Gr4AS wx-buttons", children: f.map((m) => /* @__PURE__ */ r("div", { className: "wx-2Gr4AS wx-button-item", children: /* @__PURE__ */ r(
            ye,
            {
              onClick: (N3) => h(N3, Dt(m)),
              children: u(m)
            }
          ) }, m)) })
        ] })
      ] })
    }
  );
}
function pe(e) {
  let { words: t2 = null, optional: n = false, children: c } = e, l = X(K);
  const i3 = E(() => {
    let a3 = l;
    return (!a3 || !a3.extend) && (a3 = locale(en_default)), t2 !== null && (a3 = a3.extend(t2, n)), a3;
  }, [t2, n, l]);
  return /* @__PURE__ */ r(K.Provider, { value: i3, children: c });
}
function Ce(e, t2, n, c) {
  if (!e || c) {
    const l = t2 ? new Date(t2) : /* @__PURE__ */ new Date();
    l.setDate(1), n(l);
  } else if (e.getDate() !== 1) {
    const l = new Date(e);
    l.setDate(1), n(l);
  }
}
var $t = ["clear", "today"];
function Tt({
  value: e,
  current: t2,
  markers: n = null,
  buttons: c = $t,
  css: l = "",
  onChange: i3
}) {
  const [a3, o] = useWritableProp(e), [s, u] = useWritableProp(t2);
  J(() => {
    Ce(s, a3, u, false);
  }, [a3, s]);
  const d = V(
    (f) => {
      const h = f.value;
      h ? (o(new Date(h)), Ce(s, new Date(h), u, true)) : o(null), i3 && i3({ value: h ? new Date(h) : null });
    },
    [i3, s]
  ), p = V(
    (f) => {
      u(f);
    },
    [u]
  );
  return s ? /* @__PURE__ */ r(pe, { children: /* @__PURE__ */ r(
    de,
    {
      value: a3,
      current: s,
      markers: n,
      buttons: c,
      css: l,
      onChange: d,
      onCurrentChange: p
    }
  ) }) : null;
}
function be(e) {
  return e || (e = {}), e.width || (e.width = "unset"), e;
}
var Vt = ["clear", "today"];
function tn({
  value: e,
  id: t2,
  disabled: n = false,
  error: c = false,
  placeholder: l = "",
  format: i3 = "",
  buttons: a3 = Vt,
  css: o = "",
  title: s = "",
  tooltip: u,
  editable: d = false,
  clear: p = false,
  onChange: f,
  dropdown: h = {}
}) {
  const { calendar: v, formats: k2 } = (X(K) || ne()).getRaw(), x3 = i3 || k2?.dateFormat;
  let w = typeof x3 == "function" ? x3 : dateToString(x3, v);
  const [m, N3] = O(e), [$2, y4] = O(false);
  J(() => {
    N3(e);
  }, [e]);
  function b4() {
    y4(false);
  }
  function g(R4) {
    const Y4 = R4 === m || R4 && m && R4.valueOf() === m.valueOf() || !R4 && !m;
    N3(R4), Y4 || f && f({ value: R4 }), setTimeout(b4, 1);
  }
  const H3 = E(
    () => m ? w(m) : "",
    [m, w]
  );
  function C4({ value: R4, input: Y4 }) {
    if (!d && !p || Y4) return;
    let G3 = typeof d == "function" ? d(R4) : R4 ? new Date(R4) : null;
    G3 = isNaN(G3) ? m || null : G3 || null, g(G3);
  }
  return J(() => {
    const R4 = b4;
    return window.addEventListener("scroll", R4), () => window.removeEventListener("scroll", R4);
  }, []), /* @__PURE__ */ L("div", { className: "wx-1lKOFG wx-datepicker", onClick: () => y4(true), children: [
    /* @__PURE__ */ r(
      ke,
      {
        css: `wx-date-input ${o}`,
        title: s,
        tooltip: u,
        value: H3,
        id: t2,
        readonly: !d,
        disabled: n,
        error: c,
        placeholder: l,
        onInput: b4,
        onChange: C4,
        icon: "wxi-calendar",
        clear: p
      }
    ),
    $2 && !n && /* @__PURE__ */ r(
      se,
      {
        onCancel: b4,
        ...be(h),
        children: /* @__PURE__ */ r(
          Tt,
          {
            buttons: a3,
            value: m,
            onChange: (R4) => g(R4.value)
          }
        )
      }
    )
  ] });
}
function an({
  value: e = "",
  options: t2 = [],
  textOptions: n = null,
  placeholder: c = "",
  disabled: l = false,
  error: i3 = false,
  title: a3 = "",
  tooltip: o,
  textField: s = "label",
  clear: u = false,
  css: d = "",
  children: p,
  onChange: f,
  dropdown: h = {}
}) {
  const v = F(null), k2 = F(null);
  let [x3, w] = useWritableProp(e);
  function m(g) {
    v.current = g.navigate, k2.current = g.keydown;
  }
  const N3 = E(() => x3 || x3 === 0 ? (n || t2).find((g) => g.id === x3) : null, [x3, n, t2]), $2 = V(
    ({ id: g }) => {
      (g || g === 0) && (w(g), v.current(null), f && f({ value: g }));
    },
    [w, f]
  ), y4 = V(
    (g) => {
      g.stopPropagation(), w(""), f && f({ value: "" });
    },
    [w, f]
  ), b4 = V(() => t2.findIndex((g) => g.id === x3), [t2, x3]);
  return /* @__PURE__ */ L(
    "div",
    {
      className: `wx-2YgblL wx-richselect ${d} ${i3 ? "wx-2YgblL wx-error" : ""} ${l ? "wx-2YgblL wx-disabled" : ""} ${p ? "" : "wx-2YgblL wx-nowrap"}`,
      title: a3,
      onClick: () => v.current(b4()),
      onKeyDown: (g) => k2.current(g, b4()),
      tabIndex: 0,
      "data-tooltip-text": o,
      children: [
        /* @__PURE__ */ r("div", { className: "wx-2YgblL wx-label", children: N3 ? p ? p(N3) : N3[s] : c ? /* @__PURE__ */ r("span", { className: "wx-2YgblL wx-placeholder", children: c }) : " " }),
        u && !l && x3 ? /* @__PURE__ */ r("i", { className: "wx-2YgblL wx-icon wxi-close", onClick: y4 }) : /* @__PURE__ */ r("i", { className: "wx-2YgblL wx-icon wxi-angle-down" }),
        !l && /* @__PURE__ */ r(Ne, { items: t2, onReady: m, onSelect: $2, ...h, children: ({ option: g }) => p ? p(g) : g[s] })
      ]
    }
  );
}
function Le({
  id: e,
  label: t2 = "",
  css: n = "",
  min: c = 0,
  max: l = 100,
  value: i3 = 0,
  step: a3 = 1,
  title: o = "",
  tooltip: s,
  disabled: u = false,
  onChange: d,
  width: p = ""
}) {
  const f = te(e), [h, v] = useWritableProp(i3), k2 = F({ value: h, input: h }), x3 = E(
    () => (h - c) / (l - c) * 100 + "%",
    [h, c, l]
  ), w = E(() => u ? "" : `linear-gradient(90deg, var(--wx-slider-primary) 0% ${x3}, var(--wx-slider-background) ${x3} 100%)`, [u, x3]);
  function m({ target: b4 }) {
    const g = b4.value * 1;
    v(g), d && d({
      value: g,
      previous: k2.current.input,
      input: true
    }), k2.current.input = g;
  }
  function N3({ target: b4 }) {
    const g = b4.value * 1;
    v(g), d && d({ value: g, previous: k2.current.value }), k2.current.value = g;
  }
  J(() => {
    v(i3);
  }, [i3]);
  const $2 = F(null);
  J(() => {
    if ($2.current)
      return $2.current.addEventListener("change", N3), () => {
        $2.current && $2.current.removeEventListener("change", N3);
      };
  }, [$2, N3]);
  const y4 = { ...p && { width: p } };
  return /* @__PURE__ */ L(
    "div",
    {
      className: `wx-2EDJ8G wx-slider ${n}`,
      style: y4,
      title: o,
      "data-tooltip-text": s,
      children: [
        t2 && /* @__PURE__ */ r("label", { className: "wx-2EDJ8G wx-label", htmlFor: f, children: t2 }),
        /* @__PURE__ */ r("div", { className: "wx-2EDJ8G wx-inner", children: /* @__PURE__ */ r(
          "input",
          {
            id: f,
            className: "wx-2EDJ8G wx-input",
            type: "range",
            min: c,
            max: l,
            step: a3,
            disabled: u,
            value: h,
            onInput: m,
            style: { background: w },
            ref: $2
          }
        ) })
      ]
    }
  );
}
var wn = ({
  options: e = [],
  value: t2 = "",
  type: n = "top",
  css: c = "",
  onChange: l
}) => {
  const [i3, a3] = useWritableProp(t2), o = (s) => {
    a3(s), l && l({ value: s });
  };
  return /* @__PURE__ */ r("div", { className: `wx-138fWJ wx-tabs wx-${n} ${c}`, children: e.map((s) => /* @__PURE__ */ L(
    "button",
    {
      className: `wx-138fWJ wx-tab ${s.css} ${s.id === i3 ? "wx-active" : ""}`,
      title: s.title,
      onClick: () => o(s.id),
      "data-tooltip-text": s.tooltip,
      children: [
        s.icon && /* @__PURE__ */ r(
          "i",
          {
            className: `wx-138fWJ wx-icon ${s.icon} ${s.label ? "" : "wx-only"}`
          }
        ),
        s.label && /* @__PURE__ */ r("span", { className: "wx-138fWJ wx-label", children: s.label })
      ]
    },
    s.id
  )) });
};
var xn = ({
  id: e,
  value: t2 = 0,
  step: n = 1,
  min: c = 0,
  max: l = 1 / 0,
  error: i3 = false,
  disabled: a3 = false,
  readonly: o = false,
  css: s = "",
  tooltip: u,
  onChange: d
}) => {
  const p = te(e), [f, h] = useWritableProp(t2), v = V(() => {
    if (o || f <= c) return;
    const m = f - n;
    h(m), d && d({ value: m });
  }, [f, o, c, n, d]), k2 = V(() => {
    if (o || f >= l) return;
    const m = f + n;
    h(m), d && d({ value: m });
  }, [f, o, l, n, d]), x3 = V(() => {
    if (!o) {
      const m = Math.round(Math.min(l, Math.max(f, c)) / n) * n, N3 = isNaN(m) ? Math.max(c, 0) : m;
      h(N3), d && d({ value: N3 });
    }
  }, [o, f, l, c, n, d]), w = V(
    (m) => {
      const N3 = m.target.value * 1;
      h(N3), d && d({ value: N3, input: true });
    },
    [d]
  );
  return /* @__PURE__ */ L(
    "div",
    {
      className: `wx-22t21n wx-counter ${s} ${a3 ? "wx-disabled" : ""} ${o ? "wx-readonly" : ""} ${i3 ? "wx-error" : ""}`,
      "data-tooltip-text": u,
      children: [
        /* @__PURE__ */ r(
          "button",
          {
            "aria-label": "-",
            className: "wx-22t21n wx-btn wx-btn-dec",
            disabled: a3,
            onClick: v,
            children: /* @__PURE__ */ r(
              "svg",
              {
                className: "wx-22t21n wx-dec",
                width: "12",
                height: "2",
                viewBox: "0 0 12 2",
                fill: "none",
                xmlns: "http://www.w3.org/2000/svg",
                children: /* @__PURE__ */ r("path", { d: "M11.2501 1.74994H0.750092V0.249939H11.2501V1.74994Z" })
              }
            )
          }
        ),
        /* @__PURE__ */ r(
          "input",
          {
            id: p,
            type: "text",
            className: "wx-22t21n wx-input",
            disabled: a3,
            readOnly: o,
            required: true,
            value: f,
            onBlur: x3,
            onInput: w
          }
        ),
        /* @__PURE__ */ r(
          "button",
          {
            "aria-label": "-",
            className: "wx-22t21n wx-btn wx-btn-inc",
            disabled: a3,
            onClick: k2,
            children: /* @__PURE__ */ r(
              "svg",
              {
                className: "wx-22t21n wx-inc",
                width: "12",
                height: "12",
                viewBox: "0 0 12 12",
                fill: "none",
                xmlns: "http://www.w3.org/2000/svg",
                children: /* @__PURE__ */ r(
                  "path",
                  {
                    d: `M11.2501
								6.74994H6.75009V11.2499H5.25009V6.74994H0.750092V5.24994H5.25009V0.749939H6.75009V5.24994H11.2501V6.74994Z`
                  }
                )
              }
            )
          }
        )
      ]
    }
  );
};
function St({ notice: e = {} }) {
  function t2() {
    e.remove && e.remove();
  }
  return /* @__PURE__ */ L(
    "div",
    {
      className: `wx-11sNg5 wx-notice wx-${e.type ? e.type : ""}`,
      role: "status",
      "aria-live": "polite",
      children: [
        /* @__PURE__ */ r("div", { className: "wx-11sNg5 wx-text", children: e.text }),
        /* @__PURE__ */ r("div", { className: "wx-11sNg5 wx-button", children: /* @__PURE__ */ r("i", { className: "wx-11sNg5 wxi-close", onClick: t2 }) })
      ]
    }
  );
}
function Ft({ data: e = [] }) {
  return /* @__PURE__ */ r("div", { className: "wx-3nwoO9 wx-notices", children: e.map((t2) => /* @__PURE__ */ r(St, { notice: t2 }, t2.id)) });
}
function Pt({
  title: e = "",
  buttons: t2 = ["cancel", "ok"],
  header: n,
  children: c,
  footer: l,
  css: i3 = "",
  onConfirm: a3,
  onCancel: o
}) {
  const s = (X(K) || ne()).getGroup("core"), u = F(null);
  J(() => {
    u.current?.focus();
  }, []);
  function d(f) {
    switch (f.code) {
      case "Enter": {
        const h = f.target.tagName;
        if (h === "TEXTAREA" || h === "BUTTON") return;
        a3 && a3({ event: f });
        break;
      }
      case "Escape":
        o && o({ event: f });
        break;
    }
  }
  function p(f, h) {
    const v = { event: f, button: h };
    h === "cancel" ? o && o(v) : a3 && a3(v);
  }
  return /* @__PURE__ */ r(
    "div",
    {
      className: `wx-1FxkZa wx-modal ${i3}`,
      ref: u,
      tabIndex: 0,
      onKeyDown: d,
      children: /* @__PURE__ */ L("div", { className: "wx-1FxkZa wx-window", children: [
        n || (e ? /* @__PURE__ */ r("div", { className: "wx-1FxkZa wx-header", children: e }) : null),
        /* @__PURE__ */ r("div", { children: c }),
        l || t2 && /* @__PURE__ */ r("div", { className: "wx-1FxkZa wx-buttons", children: t2.map((f) => /* @__PURE__ */ r("div", { className: "wx-1FxkZa wx-button", children: /* @__PURE__ */ r(
          le,
          {
            type: `block ${f === "ok" ? "primary" : "secondary"}`,
            onClick: (h) => p(h, f),
            children: s(f)
          }
        ) }, f)) })
      ] })
    }
  );
}
function Ht({ children: e }, t2) {
  const [n, c] = O(null), [l, i3] = O([]);
  return et(
    t2,
    () => ({
      showModal: (a3) => {
        const o = { ...a3 };
        return c(o), new Promise((s, u) => {
          o.resolve = (d) => {
            c(null), s(d);
          }, o.reject = (d) => {
            c(null), u(d);
          };
        });
      },
      showNotice: (a3) => {
        a3 = { ...a3 }, a3.id = a3.id || uid(), a3.remove = () => i3((o) => o.filter((s) => s.id !== a3.id)), a3.expire != -1 && setTimeout(a3.remove, a3.expire || 5100), i3((o) => [...o, a3]);
      }
    }),
    []
  ), /* @__PURE__ */ L(Q, { children: [
    e,
    n && /* @__PURE__ */ r(
      Pt,
      {
        title: n.title,
        buttons: n.buttons,
        onConfirm: n.resolve,
        onCancel: n.reject,
        children: n.message
      }
    ),
    /* @__PURE__ */ r(Ft, { data: l })
  ] });
}
var At = Xe(Ht);
function Se({
  label: e = "",
  position: t2 = "",
  error: n = false,
  type: c = "",
  required: l = false,
  id: i3,
  css: a3 = "",
  children: o,
  width: s = ""
}) {
  const u = E(() => i3 === void 0 ? uid() : i3, [i3]), d = { ...s && { width: s } };
  return /* @__PURE__ */ r(ue.Provider, { value: u, children: /* @__PURE__ */ L(
    "div",
    {
      style: d,
      className: `wx-2oVUvC wx-field wx-${t2} ${a3} ${n ? "wx-error" : ""} ${l ? "wx-required" : ""}`.trim(),
      children: [
        e && (u ? /* @__PURE__ */ r("label", { className: "wx-2oVUvC wx-label", htmlFor: u, children: e }) : /* @__PURE__ */ r("div", { className: "wx-2oVUvC wx-label", children: e })),
        /* @__PURE__ */ r("div", { className: `wx-2oVUvC wx-field-control wx-${c}`, children: o })
      ]
    }
  ) });
}
var Bt = ({
  value: e = false,
  type: t2 = "",
  icon: n = "",
  disabled: c = false,
  iconActive: l = "",
  onClick: i3,
  title: a3 = "",
  tooltip: o,
  css: s = "",
  text: u = "",
  textActive: d = "",
  children: p,
  active: f,
  onChange: h
}) => {
  const [v, k2] = useWritableProp(e), x3 = E(() => (v ? "pressed" : "") + (t2 ? " " + t2 : ""), [v, t2]), w = V(
    (m) => {
      let N3 = !v;
      i3 && i3(m), m.defaultPrevented || (k2(N3), h && h({ value: N3 }));
    },
    [v, i3, h]
  );
  return v && f ? /* @__PURE__ */ r(
    le,
    {
      title: a3,
      tooltip: o,
      text: v && d || u,
      css: s,
      type: x3,
      icon: v && l || n,
      onClick: w,
      disabled: c,
      children: snippet(f, { value: v })
    }
  ) : p ? /* @__PURE__ */ r(
    le,
    {
      title: a3,
      tooltip: o,
      text: v && d || u,
      css: s,
      type: x3,
      icon: v && l || n,
      onClick: w,
      disabled: c,
      children: p
    }
  ) : /* @__PURE__ */ r(
    le,
    {
      title: a3,
      tooltip: o,
      text: v && d || u,
      css: s,
      type: x3,
      icon: v && l || n,
      onClick: w,
      disabled: c
    }
  );
};
var Fe = new Date(0, 0, 0, 0, 0);
function hn({
  value: e = Fe,
  id: t2,
  title: n = "",
  tooltip: c,
  css: l = "",
  disabled: i3 = false,
  error: a3 = false,
  format: o = "",
  onChange: s,
  dropdown: u
}) {
  let [d, p] = useWritableProp(e);
  const { calendar: f, formats: h } = (X(K) || ne()).getRaw(), v = f.clockFormat == 12, k2 = 23, x3 = 59, w = E(() => {
    const D4 = o || h?.timeFormat;
    return typeof D4 == "function" ? D4 : dateToString(D4, f);
  }, [o, h, f]), m = E(() => w(new Date(0, 0, 0, 1)).indexOf("01") != -1, [w]), N3 = (D4, A6) => (D4 < 10 && A6 ? `0${D4}` : `${D4}`).slice(-2), $2 = (D4) => N3(D4, true), y4 = (D4) => `${D4}`.replace(/[^\d]/g, "") || 0, b4 = (D4) => v && (D4 = D4 % 12, D4 === 0) ? "12" : N3(D4, m), g = V((D4, A6) => (D4 = y4(D4), Math.min(D4, A6)), []), [H3, C4] = O(null), R4 = d || Fe, Y4 = g(R4.getHours(), k2), G3 = g(R4.getMinutes(), x3), W5 = Y4 > 12, S4 = b4(Y4), B4 = $2(G3), _4 = E(
    () => w(new Date(0, 0, 0, Y4, G3)),
    [Y4, G3, w]
  ), Z3 = V(() => {
    C4(true);
  }, []), P4 = V(() => {
    const D4 = new Date(R4);
    D4.setHours(D4.getHours() + (W5 ? -12 : 12)), p(D4), s && s({ value: D4 });
  }, [R4, W5, s]), j4 = V(
    ({ value: D4 }) => {
      if (R4.getHours() === D4) return;
      const A6 = new Date(R4);
      A6.setHours(D4), p(A6), s && s({ value: A6 });
    },
    [R4, s]
  ), I6 = V(
    ({ value: D4 }) => {
      if (R4.getMinutes() === D4) return;
      const A6 = new Date(R4);
      A6.setMinutes(D4), p(A6), s && s({ value: A6 });
    },
    [R4, s]
  ), T4 = V(
    (D4) => (D4 = g(D4, k2), v && (D4 = D4 * 1, D4 === 12 && (D4 = 0), W5 && (D4 += 12)), D4),
    [g, v, W5]
  ), M2 = V(() => {
    C4(null);
  }, []);
  return /* @__PURE__ */ L(
    "div",
    {
      className: `wx-7f497i wx-timepicker ${a3 ? "wx-7f497i wx-error" : ""} ${i3 ? "wx-7f497i wx-disabled" : ""}`,
      onClick: i3 ? void 0 : Z3,
      style: { cursor: i3 ? "default" : "pointer" },
      children: [
        /* @__PURE__ */ r(
          ke,
          {
            id: t2,
            css: `wx-date-input ${l}`,
            title: n,
            tooltip: c,
            value: _4,
            readonly: true,
            disabled: i3,
            error: a3,
            icon: "wxi-clock"
          }
        ),
        H3 && !i3 && /* @__PURE__ */ r(se, { onCancel: M2, ...be(u), children: /* @__PURE__ */ L("div", { className: "wx-7f497i wx-wrapper", children: [
          /* @__PURE__ */ L("div", { className: "wx-7f497i wx-timer", children: [
            /* @__PURE__ */ r(
              "input",
              {
                className: "wx-7f497i wx-digit",
                value: S4,
                onChange: (D4) => {
                  const A6 = T4(D4.target.value);
                  j4({ value: A6 });
                }
              }
            ),
            /* @__PURE__ */ r("div", { className: "wx-7f497i wx-separator", children: ":" }),
            /* @__PURE__ */ r(
              "input",
              {
                className: "wx-7f497i wx-digit",
                value: B4,
                onChange: (D4) => {
                  const A6 = g(D4.target.value, x3);
                  I6({ value: A6 });
                }
              }
            ),
            v && /* @__PURE__ */ r(
              Bt,
              {
                value: W5,
                onClick: P4,
                active: () => /* @__PURE__ */ r("span", { children: "pm" }),
                children: /* @__PURE__ */ r("span", { children: "am" })
              }
            )
          ] }),
          /* @__PURE__ */ r(Se, { width: "unset", children: /* @__PURE__ */ r(
            Le,
            {
              label: f.hours,
              value: Y4,
              width: "unset",
              onChange: j4,
              max: k2
            }
          ) }),
          /* @__PURE__ */ r(Se, { width: "unset", children: /* @__PURE__ */ r(
            Le,
            {
              label: f.minutes,
              value: G3,
              width: "unset",
              onChange: I6,
              max: x3
            }
          ) })
        ] }) })
      ]
    }
  );
}
var He = "#dfe2e6";
var Ae = "#2c2f3c";
var Ot = 0.75;
function Be(e) {
  if (e = e?.trim() || "", !e) return "";
  const t2 = e.split(/\s+/);
  return (t2[0][0] + (t2[1]?.[0] || "")).toUpperCase().slice(0, 2);
}
function Wt(e) {
  let t2 = e.replace("#", "");
  if (t2.length === 3 && (t2 = t2[0] + t2[0] + t2[1] + t2[1] + t2[2] + t2[2]), t2.length !== 6) return Ae;
  const n = parseInt(t2.slice(0, 2), 16) / 255, c = parseInt(t2.slice(2, 4), 16) / 255, l = parseInt(t2.slice(4, 6), 16) / 255;
  return 0.299 * n + 0.587 * c + 0.114 * l > 0.5 ? Ae : "#ffffff";
}
function Nn(e) {
  const { value: t2, size: n = 32, limit: c, css: l = "" } = e, i3 = F(null), [a3, o] = O(null), s = E(() => t2 ? Array.isArray(t2) ? t2 : [t2] : [], [t2]), u = E(() => {
    if (a3 == null || a3 <= 0)
      return null;
    const x3 = 1 + (a3 / n - 1) / Ot;
    return Math.max(1, Math.floor(x3));
  }, [a3, n]), d = E(() => {
    const x3 = c != null ? Math.min(s.length, c) : s.length;
    return u != null ? Math.min(x3, u) : x3;
  }, [s, c, u]), p = E(() => s.slice(0, d), [s, d]), f = E(() => Math.max(0, s.length - d), [s, d]);
  J(() => {
    const x3 = i3.current;
    if (!x3) return;
    const w = new ResizeObserver((m) => {
      const N3 = m[0];
      N3 && o(N3.contentRect.width);
    });
    return w.observe(x3), () => w.disconnect();
  }, []);
  const h = Math.round(n * 0.4), v = {
    width: n + "px",
    height: n + "px",
    minWidth: n + "px",
    minHeight: n + "px",
    fontSize: h + "px"
  };
  function k2(x3, w) {
    const m = w === 0 ? "0" : `${n * -0.25}px`, N3 = x3.avatar ? "transparent" : x3.color || He, $2 = x3.avatar ? "transparent" : Wt(x3.color || He);
    return { marginLeft: m, backgroundColor: N3, color: $2 };
  }
  return /* @__PURE__ */ r("div", { className: `wx-avatar-root wx-aadkRiRf ${l}`, ref: i3, children: p.length > 0 && /* @__PURE__ */ r("div", { className: "wx-avatar-stack wx-aadkRiRf", children: p.map((x3, w) => /* @__PURE__ */ L(
    "div",
    {
      className: [
        "wx-avatar",
        "wx-avatar-item",
        w === p.length - 1 && f > 0 ? "wx-avatar-overflow" : "",
        "wx-aadkRiRf"
      ].filter(Boolean).join(" "),
      style: { ...v, ...k2(x3, w) },
      children: [
        x3.avatar ? /* @__PURE__ */ r("img", { src: x3.avatar, alt: "", loading: "lazy" }) : Be(x3.name) ? /* @__PURE__ */ r("span", { className: "wx-aadkRiRf", children: Be(x3.name) }) : null,
        w === p.length - 1 && f > 0 && /* @__PURE__ */ L("span", { className: "wx-avatar-overflow-badge wx-aadkRiRf", children: [
          "+",
          f
        ] })
      ]
    },
    x3.id
  )) }) });
}
function yn(e) {
  const { fonts: t2 = false, children: n } = e;
  return /* @__PURE__ */ r(ie.Provider, { value: "willow", children: /* @__PURE__ */ L(Q, { children: [
    n && n && /* @__PURE__ */ r("div", { className: "wx-theme wx-willow-theme", children: n }),
    false
  ] }) });
}
function bn(e) {
  const { fonts: t2 = false, children: n } = e;
  return /* @__PURE__ */ r(ie.Provider, { value: "willow-dark", children: /* @__PURE__ */ L(Q, { children: [
    n && n && /* @__PURE__ */ r("div", { className: "wx-theme wx-willow-dark-theme", children: n }),
    false
  ] }) });
}
setEnv(env2);

// node_modules/@svar-ui/gantt-locales/locales/en.js
var en_default2 = {
  gantt: {
    // Header / sidebar
    "Task name": "Task name",
    "Start date": "Start date",
    "Add task": "Add task",
    Duration: "Duration",
    Task: "Task",
    Milestone: "Milestone",
    "Summary task": "Summary task",
    Resources: "Resources",
    WBS: "WBS",
    Hours: "Hours",
    // Sidebar
    Save: "Save",
    Delete: "Delete",
    Name: "Name",
    Description: "Description",
    "Select type": "Select type",
    Type: "Type",
    "End date": "End date",
    Progress: "Progress",
    Predecessors: "Predecessors",
    Successors: "Successors",
    "Add task name": "Add task name",
    "Add description": "Add description",
    "Select link type": "Select link type",
    "End-to-start": "End-to-start",
    "Start-to-start": "Start-to-start",
    "End-to-end": "End-to-end",
    "Start-to-end": "Start-to-end",
    "No links": "No links",
    "No assignments": "No assignments",
    "No segments": "No segments",
    "Add resource": "Add resource",
    Resource: "Resource",
    General: "General",
    Links: "Links",
    Lag: "Lag",
    Segments: "Segments",
    Ungrouped: "Ungrouped",
    Unassigned: "Unassigned",
    // Context menu / toolbar
    Add: "Add",
    "Child task": "Child task",
    "Task above": "Task above",
    "Task below": "Task below",
    "Convert to": "Convert to",
    Edit: "Edit",
    Cut: "Cut",
    Copy: "Copy",
    Paste: "Paste",
    Move: "Move",
    Up: "Up",
    Down: "Down",
    Indent: "Indent",
    Outdent: "Outdent",
    "Split task": "Split task",
    Segment: "Segment",
    // Toolbar
    "New task": "New task",
    "Move up": "Move up",
    "Move down": "Move down",
    Undo: "Undo",
    Redo: "Redo",
    // Formats
    Week: "Week",
    Q: "Quarter"
  }
};

// node_modules/@svar-ui/lib-state/dist/index.js
var iid = (/* @__PURE__ */ new Date()).valueOf();
function tempID() {
  return "temp://" + iid++;
}
var EventBusRouter = class {
  constructor(dispatch) {
    this._nextHandler = null;
    this._dispatch = dispatch;
    this.exec = this.exec.bind(this);
  }
  async exec(name, ev) {
    this._dispatch(name, ev);
    if (this._nextHandler) await this._nextHandler.exec(name, ev);
    return ev;
  }
  setNext(next) {
    return this._nextHandler = next;
  }
};

// node_modules/@svar-ui/gantt-store/dist/index.js
var Ft2 = (/* @__PURE__ */ new Date()).valueOf();
var je = () => Ft2++;
function zt2() {
  return "temp://" + Ft2++;
}
function Le2(e, t2) {
  if (Object.keys(e).length !== Object.keys(t2).length) return false;
  for (const n in t2) {
    const s = e[n], r2 = t2[n];
    if (!J2(s, r2)) return false;
  }
  return true;
}
function J2(e, t2) {
  if (typeof e == "number" || typeof e == "string" || typeof e == "boolean" || e === null) return e === t2;
  if (typeof e != typeof t2 || (e === null || t2 === null) && e !== t2 || e instanceof Date && t2 instanceof Date && e.getTime() !== t2.getTime()) return false;
  if (typeof e == "object") if (Array.isArray(e) && Array.isArray(t2)) {
    if (e.length !== t2.length) return false;
    for (let n = e.length - 1; n >= 0; n--) if (!J2(e[n], t2[n])) return false;
    return true;
  } else return Le2(e, t2);
  return e === t2;
}
var K2 = class {
  constructor(e) {
    this._data = e, this._pool = /* @__PURE__ */ new Map();
    for (let t2 = 0; t2 < e.length; t2++) {
      const n = e[t2];
      this._pool.set(n.id, n);
    }
  }
  add(e) {
    e = { id: je(), ...e }, this._data.push(e), this._pool.set(e.id, e);
  }
  update(e, t2) {
    const n = this._data.findIndex((r2) => r2.id == e), s = { ...this._data[n], ...t2 };
    this._data[n] = s, this._pool.set(s.id, s);
  }
  remove(e) {
    this._data = this._data.filter((t2) => t2.id != e), this._pool.delete(e);
  }
  filter(e) {
    this._data = this._data.filter((t2) => {
      const n = e(t2);
      return n || this._pool.delete(t2.id), n;
    });
  }
  byId(e) {
    return this._pool.get(e);
  }
  map(e) {
    return this._data.map(e);
  }
  forEach(e) {
    this._data.forEach(e);
  }
};
var Bt2 = class {
  constructor(e) {
    const t2 = { id: 0, $level: 0, data: [], parent: null }, n = /* @__PURE__ */ new Map();
    n.set(0, t2), this._pool = n, e && e.length && this.parse(e, 0);
  }
  parse(e, t2) {
    const n = this._pool;
    for (let r2 = 0; r2 < e.length; r2++) {
      const a3 = e[r2];
      a3.parent = a3.parent || t2, a3.data = null, n.set(a3.id, a3);
    }
    for (let r2 = 0; r2 < e.length; r2++) {
      const a3 = e[r2], i3 = n.get(a3.parent);
      i3 && (i3.data || (i3.data = []), i3.data.push(a3));
    }
    const s = n.get(t2);
    this.setLevel(s, s.$level + 1, false);
  }
  add(e, t2) {
    const n = this._pool.get(e.parent || 0);
    e.$level = n.$level + 1, this._pool.set(e.id, e), n.data ? t2 === -1 ? n.data = [...n.data, e] : Yt(n, t2, e) : n.data = [e];
  }
  addAfter(e, t2) {
    if (!t2) return this.add(e, -1);
    const n = this.byId(t2), s = this.byId(n.parent), r2 = Z(s, n.id) + 1;
    e.parent = s.id, e.$level = s.$level + 1, this.add(e, r2);
  }
  remove(e) {
    const t2 = this._pool.get(e);
    this._remove(t2);
    const n = this._pool.get(t2.parent);
    n.data = n.data.filter((s) => s.id != e), this._clearBranch(n);
  }
  _remove(e) {
    e.data && e.data.forEach((t2) => this._remove(t2)), this._pool.delete(e.id);
  }
  update(e, t2) {
    let n = this._pool.get(e);
    const s = this._pool.get(n.parent), r2 = Z(s, n.id);
    n = { ...n, ...t2 }, s && r2 >= 0 && (s.data[r2] = n, s.data = [...s.data]), this._pool.set(n.id, n);
  }
  move(e, t2, n) {
    const s = this._pool.get(e), r2 = t2 === "child", a3 = this._pool.get(n), i3 = a3.$level + (r2 ? 1 : 0);
    if (!s || !a3) return;
    const o = this._pool.get(s.parent), c = r2 ? a3 : this._pool.get(a3.parent);
    c.data || (c.data = []);
    const d = Z(o, s.id);
    Ue2(o, d);
    const u = r2 ? c.data.length : Z(c, a3.id) + (t2 === "after" ? 1 : 0);
    if (Yt(c, u, s), o.id === c.id && d === u) return null;
    s.parent = c.id, s.$level !== i3 && (s.$level = i3, this.setLevel(s, i3 + 1, true)), this.update(s.id, s), this._clearBranch(o);
  }
  _clearBranch(e) {
    e.data && !e.data.length && (e.open && delete e.open, this.update(e.id, { data: null }));
  }
  toArray() {
    const e = [], t2 = this._pool.get(0).data;
    return t2 && Nt2(t2, e), e;
  }
  byId(e) {
    return this._pool.get(e);
  }
  getBranch(e) {
    return this._pool.get(e).data;
  }
  forEach(e) {
    this._pool.forEach((t2, n) => {
      n !== 0 && e(t2);
    });
  }
  eachChild(e, t2) {
    const n = this.byId(t2);
    !n || !n.data || n.data.forEach((s, r2) => {
      e(this.byId(s.id), r2), this.eachChild(e, s.id);
    });
  }
  setLevel(e, t2, n) {
    e.data && (e.data = e.data.map((s) => (n && (s = { ...s }, this._pool.set(s.id, s)), s.$level = t2, s.data && this.setLevel(s, t2 + 1, n), s)));
  }
};
function Nt2(e, t2) {
  e.forEach((n) => {
    t2.push(n), n.open === true && Nt2(n.data, t2);
  });
}
function Ue2(e, t2) {
  const n = [...e.data];
  n.splice(t2, 1), e.data = n;
}
function Yt(e, t2, n) {
  const s = [...e.data];
  s.splice(t2, 0, n), e.data = s;
}
function Z(e, t2) {
  return e?.data.findIndex((n) => n.id === t2);
}
var jt = 2;
var qe2 = class {
  constructor(e) {
    e && (this._writable = e.writable, this._async = e.async), this._values = {}, this._state = {};
  }
  setState(e, t2 = 0) {
    const n = {};
    return this._wrapProperties(e, this._state, this._values, "", n, t2), n;
  }
  getState() {
    return this._values;
  }
  getReactive() {
    return this._state;
  }
  _wrapProperties(e, t2, n, s, r2, a3) {
    for (const i3 in e) {
      const o = t2[i3], c = n[i3], d = e[i3];
      if (o && (c === d && typeof d != "object" || d instanceof Date && c instanceof Date && c.getTime() === d.getTime())) continue;
      const u = s + (s ? "." : "") + i3;
      o ? (o.__parse(d, u, r2, a3) && (n[i3] = d), a3 & jt ? r2[u] = o.__trigger : o.__trigger()) : (d && d.__reactive ? t2[i3] = this._wrapNested(d, d, u, r2) : t2[i3] = this._wrapWritable(d), n[i3] = d), r2[u] = r2[u] || null;
    }
  }
  _wrapNested(e, t2, n, s) {
    const r2 = this._wrapWritable(e);
    return this._wrapProperties(e, r2, t2, n, s, 0), r2.__parse = (a3, i3, o, c) => (this._wrapProperties(a3, r2, t2, i3, o, c), false), r2;
  }
  _wrapWritable(e) {
    const t2 = [], n = function() {
      for (let s = 0; s < t2.length; s++) t2[s](e);
    };
    return { subscribe: (s) => (t2.push(s), this._async ? setTimeout(s, 1, e) : s(e), () => {
      const r2 = t2.indexOf(s);
      r2 >= 0 && t2.splice(r2, 1);
    }), __trigger: () => {
      t2.length && (this._async ? setTimeout(n, 1) : n());
    }, __parse: function(s) {
      return e = s, true;
    } };
  }
};
var Xe2 = class {
  constructor(e, t2, n, s) {
    typeof e == "function" ? this._setter = e : this._setter = e.setState.bind(e), this._routes = t2, this._parsers = n, this._prev = {}, this._triggers = /* @__PURE__ */ new Map(), this._sources = /* @__PURE__ */ new Map(), this._routes.forEach((r2) => {
      r2.in.forEach((a3) => {
        const i3 = this._triggers.get(a3) || [];
        i3.push(r2), this._triggers.set(a3, i3);
      }), r2.out.forEach((a3) => {
        const i3 = this._sources.get(a3) || {};
        r2.in.forEach((o) => i3[o] = true), this._sources.set(a3, i3);
      });
    }), this._routes.forEach((r2) => {
      r2.length = Math.max(...r2.in.map((a3) => Lt(a3, this._sources, 1)));
    }), this._bus = s;
  }
  init(e) {
    const t2 = {};
    for (const n in e) if (this._prev[n] !== e[n]) {
      const s = this._parsers[n];
      t2[n] = s ? s(e[n]) : e[n];
    }
    this._prev = this._prev ? { ...this._prev, ...e } : { ...e }, this.setState(t2), this._bus && this._bus.exec("init-state", t2);
  }
  setStateAsync(e) {
    const t2 = this._setter(e, jt);
    return this._async ? Object.assign(this._async.signals, t2) : this._async = { signals: t2, timer: setTimeout(this._applyState.bind(this), 1) }, t2;
  }
  _applyState() {
    const e = this._async;
    if (e) {
      this._async = null, this._triggerUpdates(e.signals, []);
      for (const t2 in e.signals) {
        const n = e.signals[t2];
        n && n();
      }
    }
  }
  setState(e, t2 = []) {
    const n = this._setter(e);
    return this._triggerUpdates(n, t2), n;
  }
  _triggerUpdates(e, t2) {
    const n = Object.keys(e), s = !t2.length;
    t2 = t2 || [];
    for (let r2 = 0; r2 < n.length; r2++) {
      const a3 = n[r2], i3 = this._triggers.get(a3);
      i3 && i3.forEach((o) => {
        t2.indexOf(o) == -1 && t2.push(o);
      });
    }
    s && this._execNext(t2);
  }
  _execNext(e) {
    for (; e.length; ) {
      e.sort((n, s) => n.length < s.length ? 1 : -1);
      const t2 = e[e.length - 1];
      e.splice(e.length - 1), t2.exec(e);
    }
  }
};
function Lt(e, t2, n) {
  const s = t2.get(e);
  if (!s) return n;
  const r2 = Object.keys(s).map((a3) => Lt(a3, t2, n + 1));
  return Math.max(...r2);
}
var Ge2 = class {
  constructor() {
    this._nextHandler = null, this._handlers = {}, this._tag = /* @__PURE__ */ new WeakMap(), this.exec = this.exec.bind(this);
  }
  on(e, t2, n) {
    let s = this._handlers[e];
    s ? n && n.intercept ? s.unshift(t2) : s.push(t2) : s = this._handlers[e] = [t2], n && n.tag && this._tag.set(t2, n.tag);
  }
  intercept(e, t2, n) {
    this.on(e, t2, { ...n, intercept: true });
  }
  detach(e) {
    for (const t2 in this._handlers) {
      const n = this._handlers[t2];
      for (let s = n.length - 1; s >= 0; s--) this._tag.get(n[s]) === e && n.splice(s, 1);
    }
  }
  async exec(e, t2) {
    const n = this._handlers[e];
    if (n) for (let s = 0; s < n.length; s++) {
      const r2 = n[s](t2);
      if (r2 === false || r2 && r2.then && await r2 === false) return;
    }
    return this._nextHandler && await this._nextHandler.exec(e, t2), t2;
  }
  setNext(e) {
    return this._nextHandler = e;
  }
};
(/* @__PURE__ */ new Date()).valueOf();
function Re2(e) {
  return (t2) => t2[e];
}
function lt2(e, t2) {
  return (t2.getter || Re2(t2.id))(e);
}
var Qe = { text: (e, t2) => e ? e.toString().toLowerCase().indexOf(t2.toLowerCase()) !== -1 : !t2, richselect: (e, t2) => typeof t2 != "number" && !t2 ? true : e == t2, datepicker: (e, t2) => t2 ? e && Ke2(e, t2) : true, multiselect: (e, t2) => !t2 || t2?.length === 0 ? true : Array.isArray(e) ? e?.some((n) => t2.includes(n)) : e && t2.includes(e) };
function Ve(e) {
  return Qe[e];
}
function Je(e, t2) {
  const n = [];
  for (const s in e) {
    const r2 = t2.find((c) => c.id == s), { config: a3, type: i3 } = r2.header.find((c) => c.filter).filter, o = e[s];
    n.push((c) => {
      const d = lt2(c, r2);
      return a3?.handler ? a3.handler(d, o) : Ve(i3)(d, o);
    });
  }
  return (s) => {
    for (let r2 = 0; r2 < n.length; r2++) if (!n[r2](s)) return false;
    return true;
  };
}
function Ke2(e, t2) {
  return e.getFullYear() === t2.getFullYear() && e.getMonth() === t2.getMonth() && e.getDate() === t2.getDate();
}
(/* @__PURE__ */ new Date()).valueOf(), (/* @__PURE__ */ new Date()).valueOf();
function Ze2(e, t2) {
  return typeof e == "string" ? e.localeCompare(t2, void 0, { numeric: true }) : e instanceof Date || t2 instanceof Date ? e ? t2 ? e.getTime() - t2.getTime() : -1 : 1 : (e ?? 0) - (t2 ?? 0);
}
function tn2(e, t2) {
  return typeof e == "string" ? -e.localeCompare(t2, void 0, { numeric: true }) : e instanceof Date || t2 instanceof Date ? t2 ? e ? t2.getTime() - e.getTime() : -1 : 1 : (t2 ?? 0) - (e ?? 0);
}
function en({ order: e, key: t2 }, n) {
  if (typeof n?.sort == "function") return function(r2, a3) {
    const i3 = n.sort(r2, a3);
    return e === "asc" ? i3 : -i3;
  };
  const s = e === "asc" ? Ze2 : tn2;
  return (r2, a3) => s(n ? lt2(r2, n) : r2[t2], n ? lt2(a3, n) : a3[t2]);
}
function nn(e, t2) {
  if (!e || !e.length) return;
  const n = e.map((s) => {
    const r2 = t2.find((a3) => a3.id == s.key);
    return en(s, r2);
  });
  return e.length === 1 ? n[0] : function(s, r2) {
    for (let a3 = 0; a3 < n.length; a3++) {
      const i3 = n[a3](s, r2);
      if (i3 !== 0) return i3;
    }
    return 0;
  };
}
function sn(e, t2, n) {
  return e.sort(nn(t2, n));
}
function Ut(e, t2, n, s) {
  const r2 = e.id === 0 || t2(e);
  let a3 = false;
  if (Array.isArray(e.data)) {
    for (const i3 of e.data) Ut(i3, t2, n, s) && (a3 = true);
    a3 ? (delete e.$empty, s && (e.open = true)) : e.$empty = true;
  }
  return (r2 || a3) && e.id !== 0 ? (n.add(e.id), true) : false;
}
function qt(e, t2, n) {
  e.has(t2) && e.delete(t2), n?.length && n.forEach((s) => qt(e, s.id, s.data));
}
function Xt(e) {
  e.id !== 0 && delete e.$empty, Array.isArray(e.data) && e.data.forEach((t2) => Xt(t2));
}
var Gt = class extends Bt2 {
  constructor(t2) {
    super();
    __publicField(this, "_filteredIds");
    this.parse(t2, 0);
  }
  parse(t2, n) {
    if (!t2 || !t2.length) return;
    const s = t2.map((r2) => this.normalizeTask(r2));
    super.parse(s, n);
  }
  getBranch(t2) {
    const n = this._pool.get(t2);
    return this._pool.get(n.parent || 0).data;
  }
  contains(t2, n) {
    const s = this._pool.get(t2).data;
    let r2 = false;
    if (s) for (let a3 = 0; a3 < s.length; a3++) {
      if (s[a3].id === n) {
        r2 = true;
        break;
      }
      if (s[a3].data && (r2 = this.contains(s[a3].id, n), r2)) break;
    }
    return r2;
  }
  getIndexById(t2) {
    return this.getBranch(t2).findIndex((n) => n.id === t2);
  }
  add(t2, n) {
    const s = this.normalizeTask(t2);
    if (super.add(s, n), this._filteredIds && this._filteredIds.add(s.id), this._filteredIds && t2.parent) {
      const r2 = this.byId(t2.parent);
      this.hasChildItems(r2) && delete r2.$empty;
    }
    return s;
  }
  copy(t2, n, s) {
    const r2 = this.add({ ...t2, id: null, data: null, parent: n }, s);
    let a3 = [[t2.id, r2.id]];
    return t2.data?.forEach((i3, o) => {
      const c = this.copy(i3, r2.id, o);
      a3 = a3.concat(c);
    }), a3;
  }
  remove(t2) {
    const n = this.byId(t2);
    if (this._filteredIds && qt(this._filteredIds, t2, n.data), super.remove(t2), this._filteredIds && n.parent) {
      const s = this.byId(n.parent);
      this.hasChildItems(s) || (s.$empty = true);
    }
  }
  normalizeTask(t2) {
    const n = t2.id || zt2(), s = t2.parent || 0, r2 = t2.text ?? "", a3 = t2.type || "task", i3 = t2.progress || 0, o = t2.details || "", c = { ...t2, id: n, text: r2, parent: s, progress: i3, type: a3, details: o };
    return t2.segments && (c.segments = t2.segments.map((d) => ({ ...d }))), t2.segments && (c.segments = t2.segments.map((d) => ({ ...d }))), c;
  }
  getSummaryId(t2, n = false) {
    const s = this._pool.get(t2);
    if (!s.parent) return null;
    const r2 = this._pool.get(s.parent);
    if (n) {
      let a3 = t2, i3 = this.getSummaryId(a3);
      const o = [];
      for (; i3; ) a3 = i3, o.push(i3), i3 = this.getSummaryId(a3);
      return o;
    }
    return r2.type === "summary" ? r2.id : this.getSummaryId(r2.id);
  }
  sort(t2, n) {
    t2 && this.sortBranch(t2, 0, n);
  }
  sortBranch(t2, n, s) {
    const r2 = this._pool.get(n || 0).data;
    r2 && (sn(r2, t2, s), r2.forEach((a3) => {
      this.sortBranch(t2, a3.id, s);
    }));
  }
  serialize() {
    const t2 = [], n = this._pool.get(0).data;
    return n && Rt(n, t2), t2;
  }
  clear() {
    this.forEach((t2) => {
      this.remove(t2.id);
    });
  }
  filterTree(t2, n) {
    if (t2) {
      const s = this._pool.get(0), r2 = /* @__PURE__ */ new Set();
      Ut(s, t2, r2, n), this._filteredIds = r2;
    } else {
      const s = this._pool.get(0);
      Xt(s), this._filteredIds = null;
    }
  }
  toArray(t2) {
    let n = super.toArray();
    return !t2 && this._filteredIds && (n = n.filter((s) => this.isFilteredId(s.id))), n;
  }
  isFilteredId(t2) {
    return this._filteredIds?.has(t2);
  }
  hasChildItems(t2) {
    const n = t2.data?.length;
    return n && this._filteredIds ? t2.data.some((s) => this.isFilteredId(s.id)) : !!n;
  }
};
function Rt(e, t2) {
  e.forEach((n) => {
    t2.push(n), n.data && Rt(n.data, t2);
  });
}
function b(e) {
  const t2 = Object.prototype.toString.call(e);
  return e instanceof Date || typeof e == "object" && t2 === "[object Date]" ? new e.constructor(+e) : typeof e == "number" || t2 === "[object Number]" || typeof e == "string" || t2 === "[object String]" ? new Date(e) : /* @__PURE__ */ new Date(NaN);
}
function W(e, t2) {
  return e instanceof Date ? new e.constructor(t2) : new Date(t2);
}
function tt(e, t2) {
  const n = b(e);
  return isNaN(t2) ? W(e, NaN) : (t2 && n.setDate(n.getDate() + t2), n);
}
function ut(e, t2) {
  const n = b(e);
  if (isNaN(t2)) return W(e, NaN);
  if (!t2) return n;
  const s = n.getDate(), r2 = W(e, n.getTime());
  r2.setMonth(n.getMonth() + t2 + 1, 0);
  const a3 = r2.getDate();
  return s >= a3 ? r2 : (n.setFullYear(r2.getFullYear(), r2.getMonth(), s), n);
}
function Qt2(e, t2) {
  const n = +b(e);
  return W(e, n + t2);
}
var et2 = 6048e5;
var an2 = 864e5;
var Vt2 = 6e4;
var Jt = 36e5;
function rn(e, t2) {
  return Qt2(e, t2 * Jt);
}
var on = {};
function U() {
  return on;
}
function E2(e, t2) {
  const n = U(), s = t2?.weekStartsOn ?? t2?.locale?.options?.weekStartsOn ?? n.weekStartsOn ?? n.locale?.options?.weekStartsOn ?? 0, r2 = b(e), a3 = r2.getDay(), i3 = (a3 < s ? 7 : 0) + a3 - s;
  return r2.setDate(r2.getDate() - i3), r2.setHours(0, 0, 0, 0), r2;
}
function N(e) {
  return E2(e, { weekStartsOn: 1 });
}
function Kt(e) {
  const t2 = b(e), n = t2.getFullYear(), s = W(e, 0);
  s.setFullYear(n + 1, 0, 4), s.setHours(0, 0, 0, 0);
  const r2 = N(s), a3 = W(e, 0);
  a3.setFullYear(n, 0, 4), a3.setHours(0, 0, 0, 0);
  const i3 = N(a3);
  return t2.getTime() >= r2.getTime() ? n + 1 : t2.getTime() >= i3.getTime() ? n : n - 1;
}
function A(e) {
  const t2 = b(e);
  return t2.setHours(0, 0, 0, 0), t2;
}
function nt(e) {
  const t2 = b(e), n = new Date(Date.UTC(t2.getFullYear(), t2.getMonth(), t2.getDate(), t2.getHours(), t2.getMinutes(), t2.getSeconds(), t2.getMilliseconds()));
  return n.setUTCFullYear(t2.getFullYear()), +e - +n;
}
function ht2(e, t2) {
  const n = A(e), s = A(t2), r2 = +n - nt(n), a3 = +s - nt(s);
  return Math.round((r2 - a3) / an2);
}
function ft2(e) {
  const t2 = Kt(e), n = W(e, 0);
  return n.setFullYear(t2, 0, 4), n.setHours(0, 0, 0, 0), N(n);
}
function cn(e, t2) {
  return Qt2(e, t2 * Vt2);
}
function dn(e, t2) {
  const n = t2 * 3;
  return ut(e, n);
}
function Zt(e, t2) {
  const n = t2 * 7;
  return tt(e, n);
}
function ln(e, t2) {
  return ut(e, t2 * 12);
}
function q(e, t2) {
  const n = b(e), s = b(t2), r2 = n.getTime() - s.getTime();
  return r2 < 0 ? -1 : r2 > 0 ? 1 : r2;
}
function un(e, t2) {
  const n = A(e), s = A(t2);
  return +n == +s;
}
function hn2(e) {
  return e instanceof Date || typeof e == "object" && Object.prototype.toString.call(e) === "[object Date]";
}
function fn(e) {
  if (!hn2(e) && typeof e != "number") return false;
  const t2 = b(e);
  return !isNaN(Number(t2));
}
function gt2(e, t2) {
  const n = N(e), s = N(t2), r2 = +n - nt(n), a3 = +s - nt(s);
  return Math.round((r2 - a3) / et2);
}
function gn(e, t2) {
  const n = b(e), s = b(t2), r2 = n.getFullYear() - s.getFullYear(), a3 = n.getMonth() - s.getMonth();
  return r2 * 12 + a3;
}
function mn(e, t2) {
  const n = b(e), s = b(t2);
  return n.getFullYear() - s.getFullYear();
}
function mt2(e) {
  return (t2) => {
    const n = (e ? Math[e] : Math.trunc)(t2);
    return n === 0 ? 0 : n;
  };
}
function te2(e, t2) {
  return +b(e) - +b(t2);
}
function pn(e, t2, n) {
  const s = te2(e, t2) / Jt;
  return mt2(n?.roundingMethod)(s);
}
function yn2(e, t2, n) {
  const s = te2(e, t2) / Vt2;
  return mt2(n?.roundingMethod)(s);
}
function ee(e) {
  const t2 = b(e);
  return t2.setHours(23, 59, 59, 999), t2;
}
function pt2(e) {
  const t2 = b(e), n = t2.getMonth();
  return t2.setFullYear(t2.getFullYear(), n + 1, 0), t2.setHours(23, 59, 59, 999), t2;
}
function kn(e) {
  const t2 = b(e);
  return +ee(t2) == +pt2(t2);
}
function ne2(e, t2) {
  const n = b(e), s = b(t2), r2 = q(n, s), a3 = Math.abs(gn(n, s));
  let i3;
  if (a3 < 1) i3 = 0;
  else {
    n.getMonth() === 1 && n.getDate() > 27 && n.setDate(30), n.setMonth(n.getMonth() - r2 * a3);
    let o = q(n, s) === -r2;
    kn(b(e)) && a3 === 1 && q(e, s) === 1 && (o = false), i3 = r2 * (a3 - Number(o));
  }
  return i3 === 0 ? 0 : i3;
}
function _n(e, t2, n) {
  const s = ne2(e, t2) / 3;
  return mt2(n?.roundingMethod)(s);
}
function wn2(e, t2) {
  const n = b(e), s = b(t2), r2 = q(n, s), a3 = Math.abs(mn(n, s));
  n.setFullYear(1584), s.setFullYear(1584);
  const i3 = q(n, s) === -r2, o = r2 * (a3 - +i3);
  return o === 0 ? 0 : o;
}
function X2(e) {
  const t2 = b(e), n = t2.getMonth(), s = n - n % 3;
  return t2.setMonth(s, 1), t2.setHours(0, 0, 0, 0), t2;
}
function se2(e) {
  const t2 = b(e);
  return t2.setDate(1), t2.setHours(0, 0, 0, 0), t2;
}
function ae(e) {
  const t2 = b(e), n = W(e, 0);
  return n.setFullYear(t2.getFullYear(), 0, 1), n.setHours(0, 0, 0, 0), n;
}
function yt2(e) {
  const t2 = b(e), n = t2.getMonth(), s = n - n % 3 + 3;
  return t2.setMonth(s, 0), t2.setHours(23, 59, 59, 999), t2;
}
var vn = { lessThanXSeconds: { one: "less than a second", other: "less than {{count}} seconds" }, xSeconds: { one: "1 second", other: "{{count}} seconds" }, halfAMinute: "half a minute", lessThanXMinutes: { one: "less than a minute", other: "less than {{count}} minutes" }, xMinutes: { one: "1 minute", other: "{{count}} minutes" }, aboutXHours: { one: "about 1 hour", other: "about {{count}} hours" }, xHours: { one: "1 hour", other: "{{count}} hours" }, xDays: { one: "1 day", other: "{{count}} days" }, aboutXWeeks: { one: "about 1 week", other: "about {{count}} weeks" }, xWeeks: { one: "1 week", other: "{{count}} weeks" }, aboutXMonths: { one: "about 1 month", other: "about {{count}} months" }, xMonths: { one: "1 month", other: "{{count}} months" }, aboutXYears: { one: "about 1 year", other: "about {{count}} years" }, xYears: { one: "1 year", other: "{{count}} years" }, overXYears: { one: "over 1 year", other: "over {{count}} years" }, almostXYears: { one: "almost 1 year", other: "almost {{count}} years" } };
var Mn = (e, t2, n) => {
  let s;
  const r2 = vn[e];
  return typeof r2 == "string" ? s = r2 : t2 === 1 ? s = r2.one : s = r2.other.replace("{{count}}", t2.toString()), n?.addSuffix ? n.comparison && n.comparison > 0 ? "in " + s : s + " ago" : s;
};
function kt2(e) {
  return (t2 = {}) => {
    const n = t2.width ? String(t2.width) : e.defaultWidth;
    return e.formats[n] || e.formats[e.defaultWidth];
  };
}
var Tn = { full: "EEEE, MMMM do, y", long: "MMMM do, y", medium: "MMM d, y", short: "MM/dd/yyyy" };
var $n = { full: "h:mm:ss a zzzz", long: "h:mm:ss a z", medium: "h:mm:ss a", short: "h:mm a" };
var Dn = { full: "{{date}} 'at' {{time}}", long: "{{date}} 'at' {{time}}", medium: "{{date}}, {{time}}", short: "{{date}}, {{time}}" };
var Wn = { date: kt2({ formats: Tn, defaultWidth: "full" }), time: kt2({ formats: $n, defaultWidth: "full" }), dateTime: kt2({ formats: Dn, defaultWidth: "full" }) };
var In = { lastWeek: "'last' eeee 'at' p", yesterday: "'yesterday at' p", today: "'today at' p", tomorrow: "'tomorrow at' p", nextWeek: "eeee 'at' p", other: "P" };
var Cn = (e, t2, n, s) => In[e];
function G(e) {
  return (t2, n) => {
    const s = n?.context ? String(n.context) : "standalone";
    let r2;
    if (s === "formatting" && e.formattingValues) {
      const i3 = e.defaultFormattingWidth || e.defaultWidth, o = n?.width ? String(n.width) : i3;
      r2 = e.formattingValues[o] || e.formattingValues[i3];
    } else {
      const i3 = e.defaultWidth, o = n?.width ? String(n.width) : e.defaultWidth;
      r2 = e.values[o] || e.values[i3];
    }
    const a3 = e.argumentCallback ? e.argumentCallback(t2) : t2;
    return r2[a3];
  };
}
var Pn = { narrow: ["B", "A"], abbreviated: ["BC", "AD"], wide: ["Before Christ", "Anno Domini"] };
var En = { narrow: ["1", "2", "3", "4"], abbreviated: ["Q1", "Q2", "Q3", "Q4"], wide: ["1st quarter", "2nd quarter", "3rd quarter", "4th quarter"] };
var On = { narrow: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"], abbreviated: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], wide: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] };
var An = { narrow: ["S", "M", "T", "W", "T", "F", "S"], short: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"], abbreviated: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], wide: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] };
var Hn = { narrow: { am: "a", pm: "p", midnight: "mi", noon: "n", morning: "morning", afternoon: "afternoon", evening: "evening", night: "night" }, abbreviated: { am: "AM", pm: "PM", midnight: "midnight", noon: "noon", morning: "morning", afternoon: "afternoon", evening: "evening", night: "night" }, wide: { am: "a.m.", pm: "p.m.", midnight: "midnight", noon: "noon", morning: "morning", afternoon: "afternoon", evening: "evening", night: "night" } };
var Fn = { narrow: { am: "a", pm: "p", midnight: "mi", noon: "n", morning: "in the morning", afternoon: "in the afternoon", evening: "in the evening", night: "at night" }, abbreviated: { am: "AM", pm: "PM", midnight: "midnight", noon: "noon", morning: "in the morning", afternoon: "in the afternoon", evening: "in the evening", night: "at night" }, wide: { am: "a.m.", pm: "p.m.", midnight: "midnight", noon: "noon", morning: "in the morning", afternoon: "in the afternoon", evening: "in the evening", night: "at night" } };
var zn = (e, t2) => {
  const n = Number(e), s = n % 100;
  if (s > 20 || s < 10) switch (s % 10) {
    case 1:
      return n + "st";
    case 2:
      return n + "nd";
    case 3:
      return n + "rd";
  }
  return n + "th";
};
var Bn = { ordinalNumber: zn, era: G({ values: Pn, defaultWidth: "wide" }), quarter: G({ values: En, defaultWidth: "wide", argumentCallback: (e) => e - 1 }), month: G({ values: On, defaultWidth: "wide" }), day: G({ values: An, defaultWidth: "wide" }), dayPeriod: G({ values: Hn, defaultWidth: "wide", formattingValues: Fn, defaultFormattingWidth: "wide" }) };
function R(e) {
  return (t2, n = {}) => {
    const s = n.width, r2 = s && e.matchPatterns[s] || e.matchPatterns[e.defaultMatchWidth], a3 = t2.match(r2);
    if (!a3) return null;
    const i3 = a3[0], o = s && e.parsePatterns[s] || e.parsePatterns[e.defaultParseWidth], c = Array.isArray(o) ? Yn(o, (f) => f.test(i3)) : Nn2(o, (f) => f.test(i3));
    let d;
    d = e.valueCallback ? e.valueCallback(c) : c, d = n.valueCallback ? n.valueCallback(d) : d;
    const u = t2.slice(i3.length);
    return { value: d, rest: u };
  };
}
function Nn2(e, t2) {
  for (const n in e) if (Object.prototype.hasOwnProperty.call(e, n) && t2(e[n])) return n;
}
function Yn(e, t2) {
  for (let n = 0; n < e.length; n++) if (t2(e[n])) return n;
}
function jn(e) {
  return (t2, n = {}) => {
    const s = t2.match(e.matchPattern);
    if (!s) return null;
    const r2 = s[0], a3 = t2.match(e.parsePattern);
    if (!a3) return null;
    let i3 = e.valueCallback ? e.valueCallback(a3[0]) : a3[0];
    i3 = n.valueCallback ? n.valueCallback(i3) : i3;
    const o = t2.slice(r2.length);
    return { value: i3, rest: o };
  };
}
var Ln = /^(\d+)(th|st|nd|rd)?/i;
var Un = /\d+/i;
var qn = { narrow: /^(b|a)/i, abbreviated: /^(b\.?\s?c\.?|b\.?\s?c\.?\s?e\.?|a\.?\s?d\.?|c\.?\s?e\.?)/i, wide: /^(before christ|before common era|anno domini|common era)/i };
var Xn = { any: [/^b/i, /^(a|c)/i] };
var Gn = { narrow: /^[1234]/i, abbreviated: /^q[1234]/i, wide: /^[1234](th|st|nd|rd)? quarter/i };
var Rn = { any: [/1/i, /2/i, /3/i, /4/i] };
var Qn = { narrow: /^[jfmasond]/i, abbreviated: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i, wide: /^(january|february|march|april|may|june|july|august|september|october|november|december)/i };
var Vn = { narrow: [/^j/i, /^f/i, /^m/i, /^a/i, /^m/i, /^j/i, /^j/i, /^a/i, /^s/i, /^o/i, /^n/i, /^d/i], any: [/^ja/i, /^f/i, /^mar/i, /^ap/i, /^may/i, /^jun/i, /^jul/i, /^au/i, /^s/i, /^o/i, /^n/i, /^d/i] };
var Jn = { narrow: /^[smtwf]/i, short: /^(su|mo|tu|we|th|fr|sa)/i, abbreviated: /^(sun|mon|tue|wed|thu|fri|sat)/i, wide: /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i };
var Kn = { narrow: [/^s/i, /^m/i, /^t/i, /^w/i, /^t/i, /^f/i, /^s/i], any: [/^su/i, /^m/i, /^tu/i, /^w/i, /^th/i, /^f/i, /^sa/i] };
var Zn = { narrow: /^(a|p|mi|n|(in the|at) (morning|afternoon|evening|night))/i, any: /^([ap]\.?\s?m\.?|midnight|noon|(in the|at) (morning|afternoon|evening|night))/i };
var ts = { any: { am: /^a/i, pm: /^p/i, midnight: /^mi/i, noon: /^no/i, morning: /morning/i, afternoon: /afternoon/i, evening: /evening/i, night: /night/i } };
var es = { ordinalNumber: jn({ matchPattern: Ln, parsePattern: Un, valueCallback: (e) => parseInt(e, 10) }), era: R({ matchPatterns: qn, defaultMatchWidth: "wide", parsePatterns: Xn, defaultParseWidth: "any" }), quarter: R({ matchPatterns: Gn, defaultMatchWidth: "wide", parsePatterns: Rn, defaultParseWidth: "any", valueCallback: (e) => e + 1 }), month: R({ matchPatterns: Qn, defaultMatchWidth: "wide", parsePatterns: Vn, defaultParseWidth: "any" }), day: R({ matchPatterns: Jn, defaultMatchWidth: "wide", parsePatterns: Kn, defaultParseWidth: "any" }), dayPeriod: R({ matchPatterns: Zn, defaultMatchWidth: "any", parsePatterns: ts, defaultParseWidth: "any" }) };
var ns = { code: "en-US", formatDistance: Mn, formatLong: Wn, formatRelative: Cn, localize: Bn, match: es, options: { weekStartsOn: 0, firstWeekContainsDate: 1 } };
function ss(e) {
  const t2 = b(e);
  return ht2(t2, ae(t2)) + 1;
}
function as(e) {
  const t2 = b(e), n = +N(t2) - +ft2(t2);
  return Math.round(n / et2) + 1;
}
function re(e, t2) {
  const n = b(e), s = n.getFullYear(), r2 = U(), a3 = t2?.firstWeekContainsDate ?? t2?.locale?.options?.firstWeekContainsDate ?? r2.firstWeekContainsDate ?? r2.locale?.options?.firstWeekContainsDate ?? 1, i3 = W(e, 0);
  i3.setFullYear(s + 1, 0, a3), i3.setHours(0, 0, 0, 0);
  const o = E2(i3, t2), c = W(e, 0);
  c.setFullYear(s, 0, a3), c.setHours(0, 0, 0, 0);
  const d = E2(c, t2);
  return n.getTime() >= o.getTime() ? s + 1 : n.getTime() >= d.getTime() ? s : s - 1;
}
function rs(e, t2) {
  const n = U(), s = t2?.firstWeekContainsDate ?? t2?.locale?.options?.firstWeekContainsDate ?? n.firstWeekContainsDate ?? n.locale?.options?.firstWeekContainsDate ?? 1, r2 = re(e, t2), a3 = W(e, 0);
  return a3.setFullYear(r2, 0, s), a3.setHours(0, 0, 0, 0), E2(a3, t2);
}
function is(e, t2) {
  const n = b(e), s = +E2(n, t2) - +rs(n, t2);
  return Math.round(s / et2) + 1;
}
function S(e, t2) {
  const n = e < 0 ? "-" : "", s = Math.abs(e).toString().padStart(t2, "0");
  return n + s;
}
var O2 = { y(e, t2) {
  const n = e.getFullYear(), s = n > 0 ? n : 1 - n;
  return S(t2 === "yy" ? s % 100 : s, t2.length);
}, M(e, t2) {
  const n = e.getMonth();
  return t2 === "M" ? String(n + 1) : S(n + 1, 2);
}, d(e, t2) {
  return S(e.getDate(), t2.length);
}, a(e, t2) {
  const n = e.getHours() / 12 >= 1 ? "pm" : "am";
  switch (t2) {
    case "a":
    case "aa":
      return n.toUpperCase();
    case "aaa":
      return n;
    case "aaaaa":
      return n[0];
    case "aaaa":
    default:
      return n === "am" ? "a.m." : "p.m.";
  }
}, h(e, t2) {
  return S(e.getHours() % 12 || 12, t2.length);
}, H(e, t2) {
  return S(e.getHours(), t2.length);
}, m(e, t2) {
  return S(e.getMinutes(), t2.length);
}, s(e, t2) {
  return S(e.getSeconds(), t2.length);
}, S(e, t2) {
  const n = t2.length, s = e.getMilliseconds(), r2 = Math.trunc(s * Math.pow(10, n - 3));
  return S(r2, t2.length);
} };
var Y = { midnight: "midnight", noon: "noon", morning: "morning", afternoon: "afternoon", evening: "evening", night: "night" };
var ie2 = { G: function(e, t2, n) {
  const s = e.getFullYear() > 0 ? 1 : 0;
  switch (t2) {
    case "G":
    case "GG":
    case "GGG":
      return n.era(s, { width: "abbreviated" });
    case "GGGGG":
      return n.era(s, { width: "narrow" });
    case "GGGG":
    default:
      return n.era(s, { width: "wide" });
  }
}, y: function(e, t2, n) {
  if (t2 === "yo") {
    const s = e.getFullYear(), r2 = s > 0 ? s : 1 - s;
    return n.ordinalNumber(r2, { unit: "year" });
  }
  return O2.y(e, t2);
}, Y: function(e, t2, n, s) {
  const r2 = re(e, s), a3 = r2 > 0 ? r2 : 1 - r2;
  if (t2 === "YY") {
    const i3 = a3 % 100;
    return S(i3, 2);
  }
  return t2 === "Yo" ? n.ordinalNumber(a3, { unit: "year" }) : S(a3, t2.length);
}, R: function(e, t2) {
  const n = Kt(e);
  return S(n, t2.length);
}, u: function(e, t2) {
  const n = e.getFullYear();
  return S(n, t2.length);
}, Q: function(e, t2, n) {
  const s = Math.ceil((e.getMonth() + 1) / 3);
  switch (t2) {
    case "Q":
      return String(s);
    case "QQ":
      return S(s, 2);
    case "Qo":
      return n.ordinalNumber(s, { unit: "quarter" });
    case "QQQ":
      return n.quarter(s, { width: "abbreviated", context: "formatting" });
    case "QQQQQ":
      return n.quarter(s, { width: "narrow", context: "formatting" });
    case "QQQQ":
    default:
      return n.quarter(s, { width: "wide", context: "formatting" });
  }
}, q: function(e, t2, n) {
  const s = Math.ceil((e.getMonth() + 1) / 3);
  switch (t2) {
    case "q":
      return String(s);
    case "qq":
      return S(s, 2);
    case "qo":
      return n.ordinalNumber(s, { unit: "quarter" });
    case "qqq":
      return n.quarter(s, { width: "abbreviated", context: "standalone" });
    case "qqqqq":
      return n.quarter(s, { width: "narrow", context: "standalone" });
    case "qqqq":
    default:
      return n.quarter(s, { width: "wide", context: "standalone" });
  }
}, M: function(e, t2, n) {
  const s = e.getMonth();
  switch (t2) {
    case "M":
    case "MM":
      return O2.M(e, t2);
    case "Mo":
      return n.ordinalNumber(s + 1, { unit: "month" });
    case "MMM":
      return n.month(s, { width: "abbreviated", context: "formatting" });
    case "MMMMM":
      return n.month(s, { width: "narrow", context: "formatting" });
    case "MMMM":
    default:
      return n.month(s, { width: "wide", context: "formatting" });
  }
}, L: function(e, t2, n) {
  const s = e.getMonth();
  switch (t2) {
    case "L":
      return String(s + 1);
    case "LL":
      return S(s + 1, 2);
    case "Lo":
      return n.ordinalNumber(s + 1, { unit: "month" });
    case "LLL":
      return n.month(s, { width: "abbreviated", context: "standalone" });
    case "LLLLL":
      return n.month(s, { width: "narrow", context: "standalone" });
    case "LLLL":
    default:
      return n.month(s, { width: "wide", context: "standalone" });
  }
}, w: function(e, t2, n, s) {
  const r2 = is(e, s);
  return t2 === "wo" ? n.ordinalNumber(r2, { unit: "week" }) : S(r2, t2.length);
}, I: function(e, t2, n) {
  const s = as(e);
  return t2 === "Io" ? n.ordinalNumber(s, { unit: "week" }) : S(s, t2.length);
}, d: function(e, t2, n) {
  return t2 === "do" ? n.ordinalNumber(e.getDate(), { unit: "date" }) : O2.d(e, t2);
}, D: function(e, t2, n) {
  const s = ss(e);
  return t2 === "Do" ? n.ordinalNumber(s, { unit: "dayOfYear" }) : S(s, t2.length);
}, E: function(e, t2, n) {
  const s = e.getDay();
  switch (t2) {
    case "E":
    case "EE":
    case "EEE":
      return n.day(s, { width: "abbreviated", context: "formatting" });
    case "EEEEE":
      return n.day(s, { width: "narrow", context: "formatting" });
    case "EEEEEE":
      return n.day(s, { width: "short", context: "formatting" });
    case "EEEE":
    default:
      return n.day(s, { width: "wide", context: "formatting" });
  }
}, e: function(e, t2, n, s) {
  const r2 = e.getDay(), a3 = (r2 - s.weekStartsOn + 8) % 7 || 7;
  switch (t2) {
    case "e":
      return String(a3);
    case "ee":
      return S(a3, 2);
    case "eo":
      return n.ordinalNumber(a3, { unit: "day" });
    case "eee":
      return n.day(r2, { width: "abbreviated", context: "formatting" });
    case "eeeee":
      return n.day(r2, { width: "narrow", context: "formatting" });
    case "eeeeee":
      return n.day(r2, { width: "short", context: "formatting" });
    case "eeee":
    default:
      return n.day(r2, { width: "wide", context: "formatting" });
  }
}, c: function(e, t2, n, s) {
  const r2 = e.getDay(), a3 = (r2 - s.weekStartsOn + 8) % 7 || 7;
  switch (t2) {
    case "c":
      return String(a3);
    case "cc":
      return S(a3, t2.length);
    case "co":
      return n.ordinalNumber(a3, { unit: "day" });
    case "ccc":
      return n.day(r2, { width: "abbreviated", context: "standalone" });
    case "ccccc":
      return n.day(r2, { width: "narrow", context: "standalone" });
    case "cccccc":
      return n.day(r2, { width: "short", context: "standalone" });
    case "cccc":
    default:
      return n.day(r2, { width: "wide", context: "standalone" });
  }
}, i: function(e, t2, n) {
  const s = e.getDay(), r2 = s === 0 ? 7 : s;
  switch (t2) {
    case "i":
      return String(r2);
    case "ii":
      return S(r2, t2.length);
    case "io":
      return n.ordinalNumber(r2, { unit: "day" });
    case "iii":
      return n.day(s, { width: "abbreviated", context: "formatting" });
    case "iiiii":
      return n.day(s, { width: "narrow", context: "formatting" });
    case "iiiiii":
      return n.day(s, { width: "short", context: "formatting" });
    case "iiii":
    default:
      return n.day(s, { width: "wide", context: "formatting" });
  }
}, a: function(e, t2, n) {
  const s = e.getHours() / 12 >= 1 ? "pm" : "am";
  switch (t2) {
    case "a":
    case "aa":
      return n.dayPeriod(s, { width: "abbreviated", context: "formatting" });
    case "aaa":
      return n.dayPeriod(s, { width: "abbreviated", context: "formatting" }).toLowerCase();
    case "aaaaa":
      return n.dayPeriod(s, { width: "narrow", context: "formatting" });
    case "aaaa":
    default:
      return n.dayPeriod(s, { width: "wide", context: "formatting" });
  }
}, b: function(e, t2, n) {
  const s = e.getHours();
  let r2;
  switch (s === 12 ? r2 = Y.noon : s === 0 ? r2 = Y.midnight : r2 = s / 12 >= 1 ? "pm" : "am", t2) {
    case "b":
    case "bb":
      return n.dayPeriod(r2, { width: "abbreviated", context: "formatting" });
    case "bbb":
      return n.dayPeriod(r2, { width: "abbreviated", context: "formatting" }).toLowerCase();
    case "bbbbb":
      return n.dayPeriod(r2, { width: "narrow", context: "formatting" });
    case "bbbb":
    default:
      return n.dayPeriod(r2, { width: "wide", context: "formatting" });
  }
}, B: function(e, t2, n) {
  const s = e.getHours();
  let r2;
  switch (s >= 17 ? r2 = Y.evening : s >= 12 ? r2 = Y.afternoon : s >= 4 ? r2 = Y.morning : r2 = Y.night, t2) {
    case "B":
    case "BB":
    case "BBB":
      return n.dayPeriod(r2, { width: "abbreviated", context: "formatting" });
    case "BBBBB":
      return n.dayPeriod(r2, { width: "narrow", context: "formatting" });
    case "BBBB":
    default:
      return n.dayPeriod(r2, { width: "wide", context: "formatting" });
  }
}, h: function(e, t2, n) {
  if (t2 === "ho") {
    let s = e.getHours() % 12;
    return s === 0 && (s = 12), n.ordinalNumber(s, { unit: "hour" });
  }
  return O2.h(e, t2);
}, H: function(e, t2, n) {
  return t2 === "Ho" ? n.ordinalNumber(e.getHours(), { unit: "hour" }) : O2.H(e, t2);
}, K: function(e, t2, n) {
  const s = e.getHours() % 12;
  return t2 === "Ko" ? n.ordinalNumber(s, { unit: "hour" }) : S(s, t2.length);
}, k: function(e, t2, n) {
  let s = e.getHours();
  return s === 0 && (s = 24), t2 === "ko" ? n.ordinalNumber(s, { unit: "hour" }) : S(s, t2.length);
}, m: function(e, t2, n) {
  return t2 === "mo" ? n.ordinalNumber(e.getMinutes(), { unit: "minute" }) : O2.m(e, t2);
}, s: function(e, t2, n) {
  return t2 === "so" ? n.ordinalNumber(e.getSeconds(), { unit: "second" }) : O2.s(e, t2);
}, S: function(e, t2) {
  return O2.S(e, t2);
}, X: function(e, t2, n) {
  const s = e.getTimezoneOffset();
  if (s === 0) return "Z";
  switch (t2) {
    case "X":
      return ce(s);
    case "XXXX":
    case "XX":
      return H(s);
    case "XXXXX":
    case "XXX":
    default:
      return H(s, ":");
  }
}, x: function(e, t2, n) {
  const s = e.getTimezoneOffset();
  switch (t2) {
    case "x":
      return ce(s);
    case "xxxx":
    case "xx":
      return H(s);
    case "xxxxx":
    case "xxx":
    default:
      return H(s, ":");
  }
}, O: function(e, t2, n) {
  const s = e.getTimezoneOffset();
  switch (t2) {
    case "O":
    case "OO":
    case "OOO":
      return "GMT" + oe(s, ":");
    case "OOOO":
    default:
      return "GMT" + H(s, ":");
  }
}, z: function(e, t2, n) {
  const s = e.getTimezoneOffset();
  switch (t2) {
    case "z":
    case "zz":
    case "zzz":
      return "GMT" + oe(s, ":");
    case "zzzz":
    default:
      return "GMT" + H(s, ":");
  }
}, t: function(e, t2, n) {
  const s = Math.trunc(e.getTime() / 1e3);
  return S(s, t2.length);
}, T: function(e, t2, n) {
  const s = e.getTime();
  return S(s, t2.length);
} };
function oe(e, t2 = "") {
  const n = e > 0 ? "-" : "+", s = Math.abs(e), r2 = Math.trunc(s / 60), a3 = s % 60;
  return a3 === 0 ? n + String(r2) : n + String(r2) + t2 + S(a3, 2);
}
function ce(e, t2) {
  return e % 60 === 0 ? (e > 0 ? "-" : "+") + S(Math.abs(e) / 60, 2) : H(e, t2);
}
function H(e, t2 = "") {
  const n = e > 0 ? "-" : "+", s = Math.abs(e), r2 = S(Math.trunc(s / 60), 2), a3 = S(s % 60, 2);
  return n + r2 + t2 + a3;
}
var de2 = (e, t2) => {
  switch (e) {
    case "P":
      return t2.date({ width: "short" });
    case "PP":
      return t2.date({ width: "medium" });
    case "PPP":
      return t2.date({ width: "long" });
    case "PPPP":
    default:
      return t2.date({ width: "full" });
  }
};
var le2 = (e, t2) => {
  switch (e) {
    case "p":
      return t2.time({ width: "short" });
    case "pp":
      return t2.time({ width: "medium" });
    case "ppp":
      return t2.time({ width: "long" });
    case "pppp":
    default:
      return t2.time({ width: "full" });
  }
};
var os = (e, t2) => {
  const n = e.match(/(P+)(p+)?/) || [], s = n[1], r2 = n[2];
  if (!r2) return de2(e, t2);
  let a3;
  switch (s) {
    case "P":
      a3 = t2.dateTime({ width: "short" });
      break;
    case "PP":
      a3 = t2.dateTime({ width: "medium" });
      break;
    case "PPP":
      a3 = t2.dateTime({ width: "long" });
      break;
    case "PPPP":
    default:
      a3 = t2.dateTime({ width: "full" });
      break;
  }
  return a3.replace("{{date}}", de2(s, t2)).replace("{{time}}", le2(r2, t2));
};
var cs = { p: le2, P: os };
var ds = /^D+$/;
var ls = /^Y+$/;
var us = ["D", "DD", "YY", "YYYY"];
function hs(e) {
  return ds.test(e);
}
function fs(e) {
  return ls.test(e);
}
function gs(e, t2, n) {
  const s = ms(e, t2, n);
  if (console.warn(s), us.includes(e)) throw new RangeError(s);
}
function ms(e, t2, n) {
  const s = e[0] === "Y" ? "years" : "days of the month";
  return `Use \`${e.toLowerCase()}\` instead of \`${e}\` (in \`${t2}\`) for formatting ${s} to the input \`${n}\`; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md`;
}
var ps = /[yYQqMLwIdDecihHKkms]o|(\w)\1*|''|'(''|[^'])+('|$)|./g;
var ys = /P+p+|P+|p+|''|'(''|[^'])+('|$)|./g;
var ks = /^'([^]*?)'?$/;
var _s = /''/g;
var ws = /[a-zA-Z]/;
function ue2(e, t2, n) {
  const s = U(), r2 = n?.locale ?? s.locale ?? ns, a3 = n?.firstWeekContainsDate ?? n?.locale?.options?.firstWeekContainsDate ?? s.firstWeekContainsDate ?? s.locale?.options?.firstWeekContainsDate ?? 1, i3 = n?.weekStartsOn ?? n?.locale?.options?.weekStartsOn ?? s.weekStartsOn ?? s.locale?.options?.weekStartsOn ?? 0, o = b(e);
  if (!fn(o)) throw new RangeError("Invalid time value");
  let c = t2.match(ys).map((u) => {
    const f = u[0];
    if (f === "p" || f === "P") {
      const l = cs[f];
      return l(u, r2.formatLong);
    }
    return u;
  }).join("").match(ps).map((u) => {
    if (u === "''") return { isToken: false, value: "'" };
    const f = u[0];
    if (f === "'") return { isToken: false, value: bs(u) };
    if (ie2[f]) return { isToken: true, value: u };
    if (f.match(ws)) throw new RangeError("Format string contains an unescaped latin alphabet character `" + f + "`");
    return { isToken: false, value: u };
  });
  r2.localize.preprocessor && (c = r2.localize.preprocessor(o, c));
  const d = { firstWeekContainsDate: a3, weekStartsOn: i3, locale: r2 };
  return c.map((u) => {
    if (!u.isToken) return u.value;
    const f = u.value;
    (!n?.useAdditionalWeekYearTokens && fs(f) || !n?.useAdditionalDayOfYearTokens && hs(f)) && gs(f, t2, String(e));
    const l = ie2[f[0]];
    return l(o, f, r2.localize, d);
  }).join("");
}
function bs(e) {
  const t2 = e.match(ks);
  return t2 ? t2[1].replace(_s, "'") : e;
}
function he2(e) {
  const t2 = b(e), n = t2.getFullYear(), s = t2.getMonth(), r2 = W(e, 0);
  return r2.setFullYear(n, s + 1, 0), r2.setHours(0, 0, 0, 0), r2.getDate();
}
function xs(e) {
  const t2 = b(e).getFullYear();
  return t2 % 400 === 0 || t2 % 4 === 0 && t2 % 100 !== 0;
}
function fe2(e) {
  const t2 = b(e);
  return String(new Date(t2)) === "Invalid Date" ? NaN : xs(t2) ? 366 : 365;
}
function Ss(e) {
  const t2 = ft2(e), n = +ft2(Zt(t2, 60)) - +t2;
  return Math.round(n / et2);
}
function j(e, t2) {
  const n = b(e), s = b(t2);
  return +n == +s;
}
function vs(e) {
  const t2 = b(e);
  return t2.setMinutes(0, 0, 0), t2;
}
function Ms(e, t2, n) {
  const s = E2(e, n), r2 = E2(t2, n);
  return +s == +r2;
}
function Ts(e, t2) {
  const n = b(e), s = b(t2);
  return n.getFullYear() === s.getFullYear() && n.getMonth() === s.getMonth();
}
function $s(e, t2) {
  const n = X2(e), s = X2(t2);
  return +n == +s;
}
function Ds(e, t2) {
  const n = b(e), s = b(t2);
  return n.getFullYear() === s.getFullYear();
}
var _t = { year: wn2, quarter: _n, month: ne2, week: gt2, day: ht2, hour: pn, minute: yn2 };
var F2 = { year: { quarter: 4, month: 12, week: Ss, day: Ws, hour: Is }, quarter: { month: 3, week: Cs, day: ge, hour: Ps }, month: { week: Es, day: Os, hour: As }, week: { day: 7, hour: 24 * 7 }, day: { hour: 24 }, hour: { minute: 60 } };
function Ws(e) {
  return e ? fe2(e) : 365;
}
function Is(e) {
  return fe2(e) * 24;
}
function Cs(e) {
  const t2 = X2(e), n = tt(A(yt2(e)), 1);
  return gt2(n, t2);
}
function ge(e) {
  if (e) {
    const t2 = X2(e), n = yt2(e);
    return ht2(n, t2) + 1;
  }
  return 91;
}
function Ps(e) {
  return ge(e) * 24;
}
function Es(e) {
  if (e) {
    const t2 = se2(e), n = tt(A(pt2(e)), 1);
    return gt2(n, t2);
  }
  return 5;
}
function Os(e) {
  return e ? he2(e) : 30;
}
function As(e) {
  return he2(e) * 24;
}
function st2(e, t2, n) {
  const s = F2[e][t2];
  return s ? typeof s == "number" ? s : s(n) : 1;
}
function Hs(e, t2) {
  return e === t2 || !!(F2[e] && F2[e][t2]);
}
var at = { year: ln, quarter: dn, month: ut, week: Zt, day: tt, hour: rn, minute: cn };
function rt(e, t2, n) {
  if (t2) {
    if (e === "day") return (s, r2) => t2.getWorkingDays(r2, s, true);
    if (e === "hour") return (s, r2) => t2.getWorkingHours(r2, s, true);
  }
  return (s, r2, a3, i3) => {
    const o = F2[e]?.[a3];
    return !o || typeof o == "number" || ye2(e, s, r2, n) ? Q2(e, s, r2, a3, i3, n) : Fs(s, r2, e, a3, i3, n);
  };
}
function Q2(e, t2, n, s, r2, a3) {
  const i3 = s || e;
  let o = n, c = t2;
  if (r2 && (o = C(i3, n, a3), c = C(i3, t2, a3), c < t2 && (c = I(i3)(c, 1))), e !== i3) {
    const d = _t[i3](c, o), u = st2(e, i3, n);
    return d / u;
  } else return _t[i3](c, o);
}
function Fs(e, t2, n, s, r2, a3) {
  let i3 = 0;
  const o = C(n, t2, a3);
  if (t2 > o) {
    const d = at[n](o, 1);
    i3 = Q2(n, d, t2, s, void 0, a3), t2 = d;
  }
  let c = 0;
  return ye2(n, t2, e, a3) || (c = Q2(n, C(n, e, a3), t2, void 0, void 0, a3), t2 = at[n](t2, c)), c += i3 + Q2(n, e, t2, s, void 0, a3), !c && r2 && (c = Q2(n, e, t2, s, r2, a3)), c;
}
function I(e, t2) {
  if (t2) {
    if (e === "day") return (n, s) => t2.addWorkingDays(n, s, true);
    if (e === "hour") return (n, s) => t2.addWorkingHours(n, s);
  }
  return at[e];
}
var me = { year: ae, quarter: X2, month: se2, week: (e, t2) => E2(e, { weekStartsOn: t2 }), day: A, hour: vs };
function C(e, t2, n) {
  const s = me[e];
  return s ? s(t2, n) : new Date(t2);
}
var pe2 = { year: Ds, quarter: $s, month: Ts, week: (e, t2, n) => Ms(e, t2, { weekStartsOn: n }), day: un };
function ye2(e, t2, n, s) {
  const r2 = pe2[e];
  return r2 ? r2(t2, n, s) : false;
}
function wt2(e, t2 = 1, n) {
  return n.isWorkingDay(e) || (e = t2 > 0 ? n.getNextWorkingDay(e) : n.getPreviousWorkingDay(e)), e;
}
function Ys(e) {
  return (t2, n) => {
    if (n > 0) for (let s = 0; s < n; s++) t2 = e.getNextWorkingDay(t2);
    if (n < 0) for (let s = 0; s > n; s--) t2 = e.getPreviousWorkingDay(t2);
    return t2;
  };
}
function _e2(e) {
  return ue2(e, "yyyy-MM-dd");
}
function L2(e) {
  const t2 = /* @__PURE__ */ new Date();
  return e.map((n) => ({ item: n, len: I(n.unit)(t2, 1) })).sort((n, s) => n.len < s.len ? -1 : 1)[0].item;
}
var P = ["year", "quarter", "month", "week", "day", "hour"];
var bt2 = 50;
var xt2 = 300;
function js(e, t2, n, s, r2, a3, i3, o, c) {
  const d = !e || n, u = !t2 || n;
  let f = e, l = t2, g = false, m = false;
  (d || u) && r2?.forEach((h) => {
    let y4 = h.start;
    c && h.base_start < h.start && (y4 = h.base_start), d && (!f || y4 <= f) && (f = y4, g = true);
    let k2 = h.type === "milestone" ? h.start : h.end;
    if (c) {
      const _4 = h.type === "milestone" ? h.base_start : h.base_end;
      _4 && _4 > k2 && (k2 = _4);
    }
    u && (!l || k2 >= l) && (l = k2, m = true);
  });
  const p = I(s || "day");
  return f ? g && (f = p(f, -1)) : l ? f = p(l, -30) : f = /* @__PURE__ */ new Date(), l ? m && (l = p(l, 1)) : l = p(f, 30), { _start: f, _end: l };
}
function Ls(e, t2, n, s, r2, a3, i3, o) {
  const c = L2(i3).unit, d = rt(c, void 0, a3), u = d(t2, e, "", true), f = C(c, t2, a3);
  e = C(c, e, a3), t2 = f < t2 ? I(c)(f, 1) : f;
  const l = u * s, g = r2 * Math.max(o, i3.length), m = i3.map((h) => {
    const y4 = [], k2 = I(h.unit);
    let _4 = C(h.unit, e, a3);
    for (; _4 < t2; ) {
      const x3 = k2(_4, h.step), w = _4 < e ? e : _4, v = x3 > t2 ? t2 : x3, $2 = d(v, w, "", true) * s, M2 = typeof h.format == "function" ? h.format(_4, x3) : h.format;
      let T4 = "";
      h.css && (T4 += typeof h.css == "function" ? h.css(_4) : h.css), y4.push({ width: $2, value: M2, date: w, key: _e2(w), css: T4, unit: h.unit }), _4 = x3;
    }
    return { cells: y4, add: k2, height: g / i3.length };
  });
  let p = s;
  return c !== n && (p = p / st2(c, n)), { rows: m, width: l, height: g, diff: d, start: e, end: t2, lengthUnit: n, minUnit: c, lengthUnitWidth: p };
}
function Us(e, t2, n, s) {
  const r2 = typeof e == "boolean" ? {} : e, a3 = P.indexOf(L2(n).unit);
  if (typeof r2.level > "u" && (r2.level = a3), r2.levels) r2.levels.forEach((c) => {
    c.minCellWidth || (c.minCellWidth = it(r2.minCellWidth, bt2)), c.maxCellWidth || (c.maxCellWidth = it(r2.maxCellWidth, xt2));
  });
  else {
    const c = [], d = n.length || 1, u = it(r2.minCellWidth, bt2), f = it(r2.maxCellWidth, xt2);
    n.forEach((l) => {
      l.format && !t2[l.unit] && (t2[l.unit] = l.format);
    }), P.forEach((l, g) => {
      if (g === a3) c.push({ minCellWidth: u, maxCellWidth: f, scales: n });
      else {
        const m = [];
        if (g) for (let p = d - 1; p > 0; p--) {
          const h = P[g - p];
          h && m.push({ unit: h, step: 1, format: t2[h] });
        }
        m.push({ unit: l, step: 1, format: t2[l] }), c.push({ minCellWidth: u, maxCellWidth: f, scales: m });
      }
    }), r2.levels = c;
  }
  r2.levels[r2.level] || (r2.level = 0);
  const i3 = r2.levels[r2.level], o = Math.min(Math.max(s, i3.minCellWidth), i3.maxCellWidth);
  return { zoom: r2, scales: i3.scales, cellWidth: o };
}
function qs(e, t2, n, s, r2, a3, i3) {
  e.level = n;
  let o;
  const c = s.scales || s, d = L2(c).unit, u = Gs(d, r2);
  if (t2 < 0) {
    const g = st2(d, r2);
    o = i3 * g;
  } else {
    const g = st2(L2(a3).unit, d);
    o = Math.round(i3 / g);
  }
  const f = s.minCellWidth ?? bt2, l = s.maxCellWidth ?? xt2;
  return { scales: c, cellWidth: Math.min(l, Math.max(f, o)), lengthUnit: u, zoom: e };
}
function Xs(e, t2) {
  const { _start: n, _scales: s, start: r2, end: a3, _end: i3, cellWidth: o, _scaleDate: c, _zoomOffset: d, _weekStart: u } = t2, f = I(s.minUnit);
  let l = s.width;
  if (r2 && a3) {
    if (l < e && l) {
      const y4 = e / l;
      return { cellWidth: Math.ceil(o * y4) };
    }
    return {};
  }
  let g = 0;
  for (; l < e; ) l += o, g++;
  let m = 0;
  if (g) {
    if (a3) m = -g;
    else if (c && d !== null) {
      const y4 = d / o, k2 = s.diff(c, n, "hour");
      m = Math.floor(k2 - y4);
    }
  }
  let p = r2;
  r2 || (p = C(s.minUnit, f(n, m), u));
  let h = 0;
  if (c) {
    const y4 = s.diff(c, p, "hour");
    h = Math.max(0, Math.round(y4 * o) - (d || 0));
  }
  return { _start: p, _end: a3 || f(i3, g - m), scrollLeft: h };
}
function Gs(e, t2) {
  const n = P.indexOf(e), s = P.indexOf(t2);
  return s >= n ? e === "hour" ? "hour" : "day" : P[s];
}
function it(e, t2) {
  return e ?? t2;
}
function we(e, t2) {
  const { _scales: n, _start: s, _weekStart: r2 } = t2, a3 = n.lengthUnit === "day" ? n.lengthUnitWidth / 24 : n.lengthUnitWidth;
  return I("hour")(C(n.minUnit, s, r2), Math.floor(e / a3));
}
var St2 = 7;
var Rs = 3;
var vt2 = 8;
var be2 = 4;
var Qs = vt2 + be2;
function xe2(e, t2, n) {
  (e.open || e.type !== "summary" || n) && e.data?.forEach((s) => {
    s.$x += t2, s.$x_rollup && (s.$x_rollup += t2), xe2(s, t2, n);
  });
}
function Mt(e, t2) {
  const n = e.getSummaryId(t2.id);
  if (n) {
    const s = e.byId(n), r2 = { xMin: 1 / 0, xMax: 0 };
    Se2(s, r2), s.$x = r2.xMin, s.$w = r2.xMax - r2.xMin, Mt(e, s);
  }
}
function Se2(e, t2) {
  e.data?.forEach((n) => {
    if (!n.unscheduled) {
      const s = n.type === "milestone" && n.$h ? n.$h / 2 : 0;
      t2.xMin > n.$x + s && (t2.xMin = n.$x + s);
      const r2 = n.$x + n.$w - s;
      t2.xMax < r2 && (t2.xMax = r2);
    }
    n.type !== "summary" && Se2(n, t2);
  });
}
function Tt2(e, t2) {
  let n;
  t2 && (n = t2.filter((r2) => r2.parent === e.id));
  const s = { data: n, ...e };
  if (s.data?.length) s.data.forEach((r2) => {
    if (r2.unscheduled && !r2.data) return;
    (t2 || r2.type !== "summary" && r2.data) && (r2.unscheduled && (r2 = { ...r2, start: void 0, end: void 0 }), r2 = Tt2(r2, t2)), r2.start && (!s.start || s.start > r2.start) && (s.start = new Date(r2.start));
    const a3 = r2.end || r2.start;
    a3 && (!s.end || s.end < a3) && (s.end = new Date(a3));
  });
  else if (e.type === "summary") throw Error("Summary tasks must have start and end dates if they have no subtasks");
  return s;
}
function ve(e, t2, n) {
  return $t2(e, t2, n, false), n.splitTasks && e.segments?.forEach((s) => {
    ve(s, t2, { ...n, baselines: false }), s.$x -= e.$x;
  }), n.baselines && $t2(e, t2, n, true), e.data && !e.open && Me2(e, n), e;
}
function $t2(e, t2, n, s) {
  const { cellWidth: r2, cellHeight: a3, _scales: i3, baselines: o, _rollups: c } = n, { start: d, end: u, lengthUnit: f, diff: l } = i3, g = (s ? "base_" : "") + "start", m = (s ? "base_" : "") + "end", p = "$x" + (s ? "_base" : ""), h = "$y" + (s ? "_base" : ""), y4 = "$w" + (s ? "_base" : ""), k2 = "$h" + (s ? "_base" : ""), _4 = "$skip" + (s ? "_baseline" : "");
  let x3 = e[g], w = e[m];
  if (s && !x3) {
    e[_4] = true;
    return;
  }
  e[g] < d && (e[m] < d || j(e[m], d)) ? x3 = w = d : e[g] > u && (x3 = w = u), e[p] = Math.round(l(x3, d, f) * r2), e[y4] = Math.round(l(w, x3, f, true) * r2), t2 !== null && (e[h] = s ? e.$y + e.$h + be2 : a3 * t2 + Rs), e[k2] = s ? vt2 : o ? a3 - St2 - Qs : a3 - St2, e.type === "milestone" && (e[p] = e[p] - e.$h / 2, e[y4] = e.$h, s && (e[h] = e.$y + vt2, e[y4] = e[k2] = e.$h)), n.unscheduledTasks && e.unscheduled && !s || n.groupBy && e.$group ? e.$skip = true : e[_4] = j(x3, w);
}
function Me2(e, t2, n) {
  n = n ?? e.type !== "summary", e.data && !e.$skip && (n || t2._rollups) && e.data.forEach((s) => {
    (n || s.rollup) && $t2(s, null, t2, false), Me2(s, t2, n);
  });
}
function Vs(e, t2) {
  return false;
}
function Js(e, t2) {
}
var Te = (/* @__PURE__ */ new Date()).valueOf();
function Ks() {
  return Te += 1, Te;
}
var Dt2 = 20;
var Zs = function(e, t2, n, s) {
  if (!t2 || !n || !t2.$y || !n.$y || t2.$skip || n.$skip) return e.$p = "", e.$pl = 0, e.$x1 = e.$x2 = e.$y1 = e.$y2 = 0, e;
  let r2 = false, a3 = false;
  switch (e.type) {
    case "e2s":
      a3 = true;
      break;
    case "s2s":
      r2 = true, a3 = true;
      break;
    case "s2e":
      r2 = true;
      break;
  }
  const i3 = r2 ? t2.$x : t2.$x + t2.$w, o = t2.$y + t2.$h / 2, c = a3 ? n.$x : n.$x + n.$w, d = n.$y + n.$h / 2, u = (s - St2 - n.$h) / 2;
  if (i3 !== c || o !== d) {
    const { coords: f, pl: l, x1: g, x2: m, y1: p, y2: h } = ta(i3, o, c, d, r2, a3, s / 2, u), y4 = ea(c, d, a3);
    e.$p = `${f},${y4}`, e.$pl = l, e.$x1 = Math.min(g, c - 5), e.$x2 = Math.max(m, c + 5), e.$y1 = Math.min(p, d - 3), e.$y2 = Math.max(h, d + 3);
  }
  return e;
};
function ta(e, t2, n, s, r2, a3, i3, o) {
  const c = Dt2 * (r2 ? -1 : 1), d = Dt2 * (a3 ? -1 : 1), u = e + c, f = n + d, l = [e, t2, u, t2, 0, 0, 0, 0, f, s, n, s], g = f - u;
  let m = s - t2;
  const p = a3 === r2;
  p || (f <= e + Dt2 - 2 && a3 || f > e && !a3) && (m = m - i3 + o), p && a3 && u > f || p && !a3 && u < f ? (l[4] = l[2] + g, l[5] = l[3], l[6] = l[4], l[7] = l[5] + m) : (l[4] = l[2], l[5] = l[3] + m, l[6] = l[4] + g, l[7] = l[5]);
  let h = 1 / 0, y4 = -1 / 0, k2 = 1 / 0, _4 = -1 / 0, x3 = 0;
  for (let w = 0; w < l.length - 1; w += 2) l[w] < h && (h = l[w]), l[w] > y4 && (y4 = l[w]), l[w + 1] < k2 && (k2 = l[w + 1]), l[w + 1] > _4 && (_4 = l[w + 1]), w < l.length - 3 && (x3 += Math.hypot(l[w + 2] - l[w], l[w + 3] - l[w + 1]));
  return { coords: l.join(","), pl: x3, x1: h, x2: y4, y1: k2, y2: _4 };
}
function ea(e, t2, n) {
  return n ? `${e - 5},${t2 - 3},${e - 5},${t2 + 3},${e},${t2}` : `${e + 5},${t2 + 3},${e + 5},${t2 - 3},${e},${t2}`;
}
function Wt2(e) {
  return e?.map((t2) => {
    const n = t2.id || Ks();
    return { ...t2, id: n };
  });
}
var ot2 = 37;
var $e = ["start", "end", "duration"];
function sa(e, t2) {
  const { type: n, unscheduled: s } = e;
  return s || n === "summary" ? !$e.includes(t2) : n === "milestone" ? !["end", "duration"].includes(t2) : true;
}
function aa(e, t2) {
  if (typeof t2 == "function") return t2;
  const n = $e.includes(e);
  return (n || e === "resources") && (typeof t2 == "string" && (t2 = { type: t2, config: {} }), t2.config || (t2.config = {}), t2.type === "datepicker" && (t2.config.buttons = ["today"]), n) ? (s, r2) => sa(s, r2.id) ? t2 : null : t2;
}
function ra(e) {
  if (!e || !e.length) return [];
  const t2 = e.map((n) => {
    const s = n.align || "left", r2 = n.id === "add-task", a3 = r2 ? null : n.flexgrow, i3 = a3 ? 1 : n.width || (r2 ? ot2 : 120), o = n.editor && aa(n.id, n.editor);
    let c = Array.isArray(n.header) ? n.header : [n.header];
    return c = c.map((d) => (typeof d != "object" && (d = { text: d }), d.filter && typeof d.filter != "object" && (d.filter = { type: d.filter }), d)), { width: i3, align: s, header: c, id: n.id, template: n.template, _template: n._template, ...a3 && { flexgrow: a3 }, ...n.hidden && { hidden: n.hidden }, cell: n.cell, resize: n.resize ?? true, sort: n.sort ?? !r2, ...o && { editor: o }, ...n.options && { options: n.options }, getter: n.getter };
  });
  return De(t2), t2;
}
function De(e) {
  if (e.some((n) => n.flexgrow && !n.hidden)) return;
  const t2 = e.find((n) => n.id === "text" && !n.hidden) || e.find((n) => n.id !== "add-task" && !n.hidden);
  t2 && (t2.flexgrow = 1);
}
var We = [{ id: "text", header: "Task name", width: 183, flexgrow: 1, sort: true }, { id: "start", header: "Start date", width: 120, align: "center", sort: true }, { id: "duration", header: "Duration", width: 100, align: "center", sort: true }, { id: "add-task", header: "Add task", width: ot2, align: "center", sort: false, resize: false }];
function ia(e = {}) {
  return We.map((t2) => ({ ...t2 }));
}
function oa(e) {
  return e.reduce((t2, n) => t2 + (n.width ?? 0), 0);
}
function V2(e, t2, n, s) {
  const r2 = e.getState(), { selected: a3 } = r2, i3 = a3.length, o = ["edit-task", "paste-task", "undo", "redo"], c = ["copy-task", "cut-task"], d = ["copy-task", "cut-task", "delete-task", "indent-task:remove", "move-task:down"], u = ["add-task", "undo", "redo"], f = ["indent-task:add", "move-task:down", "move-task:up"], l = { "indent-task:remove": 2 }, g = !i3 && u.includes(t2), m = { parent: f.includes(t2), level: l[t2] };
  if (n = n || (i3 ? a3[a3.length - 1] : null), !(!n && !g)) {
    if (t2 !== "paste-task" && (e._temp = null), o.includes(t2) || g || a3.length === 1) Ie2(e, t2, n, s);
    else if (i3) {
      const p = c.includes(t2) ? a3 : la(a3, m, r2);
      d.includes(t2) && p.reverse();
      const h = e.getHistory();
      h && h.startBatch(), p.forEach((y4, k2) => Ie2(e, t2, y4, s, k2)), h && h.endBatch();
    }
  }
}
function la(e, t2, n) {
  const { tasks: s, tree: r2, groupBy: a3 } = n;
  let i3 = e.map((o) => {
    let c = o;
    a3?.field && (c = r2.byId(c)?.$id || c);
    const d = s.byId(c);
    return { id: c, level: d.$level, parent: d.parent, index: s.getIndexById(c) };
  });
  return (t2.parent || t2.level) && (i3 = i3.filter((o) => t2.level && o.level <= t2.level || !e.includes(o.parent))), i3.sort((o, c) => o.level - c.level || o.index - c.index), i3.map((o) => o.id);
}
function Ie2(e, t2, n, s, r2) {
  const a3 = e.exec ? e.exec : e.in.exec;
  let i3 = t2.split(":")[0], o = t2.split(":")[1];
  const c = n?.id || n;
  let d = { id: c }, u = {}, f = false;
  if (i3 === "copy-task" || i3 === "cut-task") {
    e._temp || (e._temp = []), e._temp.push({ id: c, cut: i3 === "cut-task" });
    return;
  } else if (i3 === "paste-task") {
    if (e._temp && e._temp.length) {
      const l = e.getHistory();
      l && l.startBatch();
      const g = /* @__PURE__ */ new Map();
      if (e._temp.forEach((m) => {
        const p = { id: m.id, target: c, mode: "after" };
        a3(m.cut ? "move-task" : "copy-task", p), g.set(m.id, p.id);
      }), !e._temp[0].cut) {
        const { links: m } = e.getState(), p = e._temp.map((y4) => y4.id), h = [];
        m.forEach((y4) => {
          p.includes(y4.source) && p.includes(y4.target) && h.push(y4);
        }), h.forEach((y4) => {
          a3("add-link", { link: { source: g.get(y4.source), target: g.get(y4.target), type: y4.type } });
        }), e._temp.forEach((y4, k2) => {
          a3("select-task", { id: g.get(y4.id), toggle: !!k2 });
        });
      }
      l && l.endBatch(), e._temp = null;
    }
    return;
  } else i3 === "add-task" ? (u = { task: { type: "task", text: s("New Task") }, target: c, show: true, mode: "after", select: false }, d = {}, f = true) : i3 === "edit-task" ? i3 = "show-editor" : i3 === "convert-task" ? (i3 = "update-task", u = { task: { type: o } }, o = void 0) : i3 === "indent-task" && (o = o === "add");
  if (i3 === "split-task" && typeof n == "object") u = n;
  else if (i3 === "delete-task" && o === "segment" && typeof n == "object") {
    const l = e.getTask(c), { segmentIndex: g } = n, m = l.segments.filter((p, h) => h !== g);
    a3("update-task", { id: c, task: { segments: m } });
    return;
  }
  typeof o < "u" && (u = { ...u, mode: o }), d = { ...d, ...u }, a3(i3, d), f && a3("select-task", { id: d.id, toggle: !!r2, eventSource: i3 });
}
function Ce2(e, t2) {
  return e.some((n) => n.data ? Ce2(n.data, t2) : n.id === t2);
}
function Pe(e, t2, n, s = 1) {
  const r2 = n[0].width, a3 = Math.max(0, Math.floor(e / r2) - s), i3 = Math.min(n.length, Math.ceil((e + t2) / r2) + s);
  return { from: a3 * r2, to: i3 * r2, start: a3, end: i3 };
}
var It = null;
var Ee = (e, t2) => I(e, t2);
var ua = (e, t2) => rt(e, t2);
function Ct(e, t2, n) {
  Array.isArray(e) && (e.forEach((s) => z(s, t2, n(s))), e.forEach((s) => {
    if (s.type === "summary" && !(s.start && s.end)) {
      const { start: r2, end: a3 } = Tt2(s, e);
      s.start = r2, s.end = a3, z(s, t2, n(s));
    }
  }));
}
function z(e, t2, n) {
  e.unscheduled || Oe(e, t2, n, false), e.base_start && Oe(e, t2, n, true);
}
function Oe(e, t2, n, s) {
  const { durationUnit: r2 } = t2, a3 = r2 || "day", [i3, o, c] = Ae2(s);
  e.type === "milestone" ? (e[c] = 0, e[o] = void 0) : e[i3] && (e[c] ? e[o] = Ee(a3, n)(e[i3], e[c]) : e[o] ? e[c] = ua(a3, n)(e[o], e[i3]) : (e[o] = Ee(a3, n)(e[i3], 1), e[c] = 1));
}
function Ae2(e) {
  return e ? ["base_start", "base_end", "base_duration"] : ["start", "end", "duration"];
}
function He2(e, t2, n) {
  const [s, r2, a3] = Ae2(n);
  (t2 === a3 || t2 === s) && (e[r2] = null), t2 === r2 && (e[a3] = 0, e[s] && e[s] >= e[r2] && (e[r2] = null, e[a3] = 1));
}
function ha(e, t2, n, s) {
  He2(e, s, false), e.base_start && He2(e, s, true), z(e, t2, n);
}
var fa = class extends qe2 {
  constructor(t2) {
    super({ writable: t2, async: false });
    __publicField(this, "in");
    __publicField(this, "_router");
    __publicField(this, "_modules", /* @__PURE__ */ new Map());
    __publicField(this, "_prevScaleMinUnit");
    __publicField(this, "_prevConfig", {});
    this._router = new Xe2(super.setState.bind(this), [{ in: ["tasks", "start", "end", "scales", "autoScale", "markers", "projectStart", "projectEnd", "baselines"], out: ["_start", "_end"], exec: (a3) => {
      const { _end: i3, _start: o, start: c, end: d, tasks: u, scales: f, autoScale: l, markers: g, projectStart: m, projectEnd: p, baselines: h, _tasksPatch: y4 } = this.getState();
      if (!y4) if (!c || !d || l) {
        const k2 = L2(f).unit, _4 = js(c, d, l, k2, u, g, m, p, h);
        (_4._end !== i3 || _4._start !== o) && this.setState(_4, a3);
      } else this.setState({ _start: c, _end: d }, a3);
    } }, { in: ["columns"], out: ["_headerLength", "_gridCollapseThreshold"], exec: (a3) => {
      const i3 = this.getState().columns;
      let o = 1, c = ot2;
      i3.length && i3.forEach((d) => {
        d.id === "add-task" && d.width && (c = d.width), o = Math.max(d.header.length, o);
      }), this.setState({ _headerLength: o, _gridCollapseThreshold: c }, a3);
    } }, { in: ["_compactMode"], out: ["displayMode"], exec: (a3) => {
      const { displayMode: i3, _compactMode: o } = this.getState();
      let c = i3;
      o ? c = i3 === "all" ? "grid" : c : c = "all", this.setState({ displayMode: c }, a3);
    } }, { in: ["displayMode", "columns", "gridWidth"], out: ["_columnsWidth"], exec: (a3) => {
      const { columns: i3, displayMode: o, gridWidth: c } = this.getState();
      if (!i3?.length) {
        this.setState({ _columnsWidth: 0 }, a3);
        return;
      }
      let d = 0;
      o === "chart" && (d = i3?.find((u) => u.id === "add-task")?.width || ot2), o === "all" && (d = c), d && this.setState({ _columnsWidth: d }, a3);
    } }, { in: ["start", "end"], out: ["cellWidth"], exec: (a3) => {
      const { _cellWidth: i3, cellWidth: o } = this.getState();
      i3 !== o && this.setState({ cellWidth: i3 }, a3);
    } }, { in: ["_start", "_end", "cellWidth", "scaleHeight", "scales", "lengthUnit", "_weekStart", "_headerLength"], out: ["_scales"], exec: (a3) => {
      const i3 = this.getState();
      let { lengthUnit: o } = i3;
      const { _start: c, _end: d, cellWidth: u, scaleHeight: f, scales: l, _weekStart: g, _headerLength: m } = i3, p = L2(l).unit;
      Hs(p, o) || (o = p);
      const h = Ls(c, d, o, u, f, g, l, m);
      this.setState({ _scales: h, _scaleMinUnit: p }, a3);
    } }, { in: ["assignments"], out: ["_assignments"], exec: (a3) => {
      const { assignments: i3 } = this.getState(), o = { byTask: {}, byResource: {} };
      i3 && i3.forEach((c) => {
        const d = c.task, u = c.resource;
        o.byTask[d] || (o.byTask[d] = []), o.byTask[d].push(c), o.byResource[u] || (o.byResource[u] = []), o.byResource[u].push(c);
      }), this.setState({ _assignments: o }, a3);
    } }, { in: ["_scales", "scrollLeft", "_chartWidth"], out: ["xArea"], exec: (a3) => {
      const { _scales: i3, scrollLeft: o, _chartWidth: c } = this.getState();
      if (!i3 || !c) {
        this.setState({ xArea: { from: 0, to: 0, start: 0, end: 0 } }, a3);
        return;
      }
      const d = i3.rows[i3.rows.length - 1].cells;
      this.setState({ xArea: Pe(o || 0, c, d) }, a3);
    } }, { in: ["tasks", "_assignments", "groupBy", "_scales"], out: ["tree"], exec: (a3) => {
      this.getState();
      const { tasks: i3, _scales: o } = this.getState(), c = this.getGrouping();
      if (c) {
        if (!o) return;
        const d = c.buildTree();
        this.setState({ tree: d });
        return;
      }
      this.setState({ tree: i3 }, a3);
    } }, { in: ["tree", "_scales", "_rollups", "cellHeight", "baselines", "unscheduledTasks"], out: ["_tasks"], exec: (a3) => {
      const { cellWidth: i3, cellHeight: o, tree: c, _scales: d, baselines: u, splitTasks: f, unscheduledTasks: l, _rollups: g, groupBy: m, _tasksPatch: p } = this.getState(), h = c.toArray();
      if (p && h.every((k2) => k2.$skip || typeof k2.$x == "number")) {
        this.setState({ _tasks: h, _tasksPatch: null }, a3);
        return;
      }
      const y4 = h.map((k2, _4) => ve(k2, _4, { cellWidth: i3, cellHeight: o, _scales: d, baselines: u, splitTasks: f, unscheduledTasks: l, _rollups: g, groupBy: m }));
      this.setState({ _tasks: y4, _tasksPatch: null }, a3);
    } }, { in: ["_tasks", "links", "cellHeight"], out: ["_links"], exec: (a3) => {
      const { tree: i3, links: o, cellHeight: c, criticalPath: d, _isFiltered: u } = this.getState(), f = o.map((l) => {
        const g = i3.byId(l.source), m = i3.byId(l.target);
        return !g || !m ? null : Zs(l, g, m, c);
      }).toSorted((l, g) => !l || !g ? 0 : d ? !!l.critical == !!g.critical ? g.$pl - l.$pl : l.critical ? 1 : -1 : g.$pl - l.$pl).filter((l) => l && u ? i3.isFilteredId(l.source) && i3.isFilteredId(l.target) : l !== null);
      this.setState({ _links: f }, a3);
    } }, { in: ["_links"], out: ["_linksIndex"], exec: (a3) => {
      const { _links: i3 } = this.getState(), o = /* @__PURE__ */ new Map();
      for (const c of i3) {
        if (!c.$p) continue;
        const d = Math.floor(c.$x1 / 2048), u = Math.floor(c.$x2 / 2048), f = Math.floor(c.$y1 / 2048), l = Math.floor(c.$y2 / 2048);
        for (let g = f; g <= l; g++) for (let m = d; m <= u; m++) {
          const p = g * 65536 + m;
          let h = o.get(p);
          h || o.set(p, h = []), h.push(c);
        }
      }
      this.setState({ _linksIndex: o }, a3);
    } }, { in: ["_linksIndex", "area", "xArea", "cellHeight"], out: ["_visibleLinks"], exec: (a3) => {
      const { _linksIndex: i3, area: o, xArea: c, cellHeight: d } = this.getState(), u = o.to ?? o.end * d, f = Math.floor(c.from / 2048), l = Math.floor(c.to / 2048), g = Math.floor(o.from / 2048), m = Math.floor(u / 2048);
      let p;
      if (f === l && g === m) p = i3.get(g * 65536 + f) ?? [];
      else {
        const y4 = /* @__PURE__ */ new Set();
        for (let k2 = g; k2 <= m; k2++) for (let _4 = f; _4 <= l; _4++) {
          const x3 = i3.get(k2 * 65536 + _4);
          if (x3) for (const w of x3) y4.add(w);
        }
        p = Array.from(y4);
      }
      const h = p.filter((y4) => y4.$y2 >= o.from && y4.$y1 <= u && y4.$x2 >= c.from && y4.$x1 <= c.to);
      this.setState({ _visibleLinks: h }, a3);
    } }, { in: ["tasks", "activeTask"], out: ["_activeTask"], exec: (a3) => {
      const { activeTask: i3, tasks: o } = this.getState(), c = o.byId(i3);
      this.setState({ _activeTask: c || null }, a3);
    } }, { in: ["tree", "selected"], out: ["_selected"], exec: (a3) => {
      const { tree: i3, selected: o, _isFiltered: c } = this.getState(), d = o.map((u) => i3.byId(u)).filter((u) => u ? !c || i3.isFilteredId(u.id) : false);
      this.setState({ _selected: d }, a3);
    } }], { tasks: (a3) => new Gt(a3), links: (a3) => new K2(Wt2(a3)), columns: (a3) => ra(a3) });
    const n = this.in = new Ge2();
    n.on("show-editor", (a3) => {
      this.setStateAsync({ activeTask: a3.id });
    }), n.on("select-task", ({ id: a3, toggle: i3, range: o, show: c = true, focus: d, eventSource: u }) => {
      const { selected: f, _tasks: l, activeTask: g } = this.getState();
      let m = false, p;
      if (f.length && (i3 || o)) {
        const y4 = [...f];
        if (o) {
          const k2 = y4[y4.length - 1], _4 = l.findIndex((M2) => M2.id === k2), x3 = l.findIndex((M2) => M2.id === a3), w = Math.min(_4, x3), v = Math.max(_4, x3) + 1, $2 = l.slice(w, v).map((M2) => M2.id);
          _4 > x3 && $2.reverse(), $2.forEach((M2) => {
            y4.includes(M2) || y4.push(M2);
          });
        } else if (i3) {
          const k2 = y4.findIndex((_4) => _4 === a3);
          k2 === -1 ? y4.push(a3) : (m = true, y4.splice(k2, 1));
        }
        p = y4;
      } else p = [a3];
      const h = { selected: p };
      if (this.setStateAsync(h), p.length && (d && (c = d === "chart" ? "xy" : c || "y"), c)) {
        const y4 = () => {
          this.scrollToTask(p[0], c), d && this.setStateAsync({ focusTask: { id: p[0], column: d === "grid" } });
        };
        u === "add-task" ? setTimeout(y4, 1) : y4();
      }
      !m && g && g !== a3 && n.exec("show-editor", { id: a3 });
    }), n.on("delete-link", ({ id: a3 }) => {
      const { links: i3 } = this.getState();
      i3.remove(a3), this.setStateAsync({ links: i3 });
    }), n.on("update-link", (a3) => {
      const { links: i3 } = this.getState(), o = a3.id;
      let c = a3.link;
      i3.update(o, c), c = i3.byId(o), !c.lag && c.lag !== 0 && delete c.lag, this.setStateAsync({ links: i3 }), a3.link = c;
    }), n.on("add-link", (a3) => {
      const { link: i3 } = a3, { links: o } = this.getState();
      !i3.source || !i3.target || (i3.type || (i3.type = "e2s"), i3.id = i3.id || zt2(), o.add(i3), this.setStateAsync({ links: o }), a3.id = i3.id, a3.link = o.byId(i3.id));
    });
    let s = null;
    n.on("move-task", (a3) => {
      const { tasks: i3 } = this.getState();
      let { mode: o, target: c } = a3;
      const { id: d, inProgress: u } = a3, f = i3.byId(d);
      if (typeof u > "u" ? a3.source = f.parent : a3.source = s = s ?? f.parent, u === false) {
        i3.update(f.id, { $reorder: false }), this.setState({ tasks: i3 }), s = null;
        return;
      }
      if (c === d || i3.contains(d, c)) {
        a3.skipProvider = true;
        return;
      }
      if (o === "up" || o === "down") {
        const l = i3.getBranch(d);
        let g = i3.getIndexById(d);
        if (o === "up") {
          const m = f.parent === 0;
          if (g === 0 && m) {
            a3.skipProvider = true;
            return;
          }
          g -= 1, o = "before";
        } else if (o === "down") {
          const m = g === l.length - 1, p = f.parent === 0;
          if (m && p) {
            a3.skipProvider = true;
            return;
          }
          g += 1, o = "after";
        }
        if (c = l[g] && l[g].id || f.parent, c) {
          const m = i3.getBranch(c);
          let p = i3.getIndexById(c), h = m[p];
          if (h.data) {
            if (o === "before") {
              if (h.parent === f.parent) {
                for (; h.data; ) h.open || n.exec("open-task", { id: h.id, mode: true }), h = h.data[h.data.length - 1];
                c = h.id;
              }
            } else if (o === "after") {
              let _4;
              h.parent === f.parent ? (_4 = h, h = h.data[0], c = h.id, o = "before") : m.length - 1 !== p && (_4 = h, p += 1, h = m[p], f.$level > h.$level && h.data ? (_4 = h, h = h.data[0], c = h.id, o = "before") : c = h.id), _4 && !_4.open && n.exec("open-task", { id: _4.id, mode: true });
            }
          }
          const y4 = i3.getSummaryId(f.id);
          i3.move(d, o, c);
          const k2 = i3.getSummaryId(d);
          y4 !== k2 && (y4 && this.resetSummaryDates(y4, "move-task"), k2 && this.resetSummaryDates(k2, "move-task"));
        }
      } else {
        const l = i3.byId(c);
        let g = l, m = false;
        for (; g.$level > f.$level; ) g = i3.byId(g.parent), g.id === d && (m = true);
        if (m) return;
        const p = i3.getSummaryId(f.id);
        if (i3.move(d, o, c), o === "child") {
          let y4 = l;
          for (; y4.id !== 0 && !y4.open; ) n.exec("open-task", { id: y4.id, mode: true }), y4 = i3.byId(y4.parent);
        }
        const h = i3.getSummaryId(d);
        p !== h && (p && this.resetSummaryDates(p, "move-task"), h && this.resetSummaryDates(h, "move-task"));
      }
      u ? this.setState({ tasks: i3 }) : this.setStateAsync({ tasks: i3 }), a3.target = c, a3.mode = o;
    }), n.on("drag-task", (a3) => {
      const i3 = this.getState(), { tree: o, _tasks: c, _selected: d, rollups: u, slack: f } = i3, l = o.byId(a3.id), { left: g, top: m, width: p, inProgress: h } = a3, y4 = { _tasks: c, _selected: d };
      if (typeof p < "u" && (l.$w = p, Mt(o, l)), typeof g < "u") {
        if (l.type === "summary") {
          const k2 = g - l.$x;
          xe2(l, k2, !!u);
        }
        l.$x = g, Mt(o, l);
      }
      typeof m < "u" && (l.$y = m + 4, l.$reorder = h), this.setState(y4);
    });
    const r2 = /* @__PURE__ */ new Set(["start", "end", "duration", "type", "unscheduled", "base_start", "base_end", "base_duration", "segments", "rollup"]);
    n.on("update-task", (a3) => {
      const { id: i3, segmentIndex: o, diff: c, eventSource: d } = a3;
      let { task: u } = a3;
      const f = this.getState(), { tasks: l, _scales: g, durationUnit: m, splitTasks: p, _calendars: h } = f, y4 = { tasks: l, _tasksPatch: false }, k2 = l.byId(i3), _4 = this.getTaskCalendar({ ...k2, ...u }), x3 = { durationUnit: m };
      if (d === "add-task" || d === "copy-task" || d === "move-task" || d === "update-task" || d === "delete-task" || d === "provide-data" || d === "schedule-tasks") {
        d === "schedule-tasks" ? (l.update(i3, u), this.setState({ tasks: l })) : (z(u, x3, _4), l.update(i3, u));
        return;
      }
      if (!(c || o >= 0 || "type" in u && u.type !== k2.type || Object.keys(u).some((T4) => {
        if (!r2.has(T4) || T4 === "type") return false;
        const D4 = u[T4], B4 = k2[T4];
        return !J2(D4, B4);
      }))) {
        l.update(i3, u);
        const T4 = l.byId(i3), D4 = !this.getGrouping() && typeof T4.$x == "number";
        this.setStateAsync({ tasks: l, _tasksPatch: D4 }), a3.task = T4;
        return;
      }
      const w = g.lengthUnit;
      let v = I(w);
      const $2 = rt(m, _4);
      if (c && (u.start && (u.start = v(u.start, c)), !o && o !== 0 && (u.start && u.end ? u.duration = k2.duration : (u.start ? u.end = k2.end : (u.end = v(u.end, c), u.start = k2.start, u.duration = $2(u.end, u.start)), $2(u.end, u.start) || (u.duration = 1)))), u.type = u.type ?? k2.type, _4 && u.start && (u.start = wt2(u.start, c, _4)), u.start && u.end && (!j(u.start, k2.start) || !j(u.end, k2.end)) && u.type === "summary" && k2.data?.length) {
        let T4 = c || $2(u.start, k2.start);
        _4 && (T4 = u.start > k2.start ? $2(u.start, k2.start) : -$2(k2.start, u.start), v = Ys(_4)), this.moveSummaryKids(k2, (D4, B4) => {
          if (D4 = v(D4, T4), !_4) return D4;
          const Ye = h ? this.getTaskCalendar(B4) : _4;
          return wt2(D4, c, Ye);
        }, "update-task");
      }
      u.start || (u.start = k2.start), !u.end && !u.duration && (u.duration = k2.duration), z(u, x3, _4), l.update(i3, u), (_4 && u.type === "summary" || u.type === "summary" && k2.type !== "summary") && this.resetSummaryDates(i3, "update-task", true);
      const M2 = l.getSummaryId(i3);
      M2 && this.resetSummaryDates(M2, "update-task"), this.setStateAsync(y4), a3.task = l.byId(i3);
    }), n.on("add-task", (a3) => {
      const { tasks: i3, _scales: o, unscheduledTasks: c, durationUnit: d, splitTasks: u, tree: f } = this.getState(), { target: l, mode: g, task: m, show: p, select: h = true } = a3;
      !a3.eventSource && c && (m.unscheduled = true);
      const y4 = this.getTaskCalendar(m);
      let k2 = -1, _4, x3;
      if (l ? (x3 = i3.byId(l), g === "child" ? (_4 = x3, m.parent = _4.id) : (x3.parent !== null && (_4 = i3.byId(x3.parent), m.parent = _4.id), k2 = i3.getIndexById(l), g === "after" && (k2 += 1))) : m.parent && (_4 = i3.byId(m.parent)), !m.start) {
        if (_4?.start) m.start = new Date(_4.start.valueOf());
        else if (x3) m.start = new Date(x3.start.valueOf());
        else {
          const M2 = i3.getBranch(0);
          let T4;
          if (M2?.length) {
            const D4 = M2[M2.length - 1];
            if (!D4.$skip) {
              const B4 = new Date(D4.start.valueOf());
              o.start <= B4 && (T4 = B4);
            }
          }
          m.start = T4 || I(d, y4)(o.start, 1);
        }
        m.duration = m.duration || 1;
      }
      y4 && (m.start = wt2(m.start, 1, y4)), this.getState().baselines && (m.base_start = m.start, m.base_duration = m.duration), z(m, { durationUnit: d }, y4);
      const w = i3.add(m, k2), v = { tasks: i3 };
      if (p) for (; _4 && _4.id; ) n.exec("open-task", { id: _4.id, mode: true }), _4 = f.byId(_4.parent);
      a3.id = w.id;
      const $2 = i3.getSummaryId(w.id);
      $2 && this.resetSummaryDates($2, "add-task"), this.setStateAsync(v), a3.id = w.id, a3.task = w, h ? n.exec("select-task", { id: w.id, show: p, eventSource: "add-task" }) : p && this.scrollToTask(w.id, p);
    }), n.on("delete-task", (a3) => {
      const { id: i3 } = a3, o = this.getState(), { tasks: c, links: d, selected: u } = o, f = c.byId(i3);
      a3.source = f.parent;
      const l = c.getSummaryId(i3), g = [i3];
      c.eachChild((h) => g.push(h.id), i3), d.filter((h) => !(g.includes(h.source) || g.includes(h.target)));
      const m = { tasks: c, links: d }, p = o.groupBy?.field === "resource";
      (u.includes(i3) || p) && (m.selected = u.filter((h) => h !== i3 && (!p || o.tree.byId(h)?.$id !== i3))), c.remove(i3), l && this.resetSummaryDates(l, "delete-task"), this.setStateAsync(m);
    }), n.on("indent-task", ({ id: a3, mode: i3 }) => {
      const { tasks: o } = this.getState();
      if (i3) {
        const c = o.getBranch(a3)[o.getIndexById(a3) - 1];
        c && n.exec("move-task", { id: a3, mode: "child", target: c.id });
      } else {
        const c = o.byId(a3), d = o.byId(c.parent);
        d && d.parent !== null && n.exec("move-task", { id: a3, mode: "after", target: c.parent });
      }
    }), n.on("copy-task", (a3) => {
      const { id: i3, target: o, mode: c, eventSource: d } = a3;
      if (d === "copy-task") return;
      const { tasks: u, links: f } = this.getState();
      if (u.contains(i3, o)) {
        a3.skipProvider = true;
        return;
      }
      const l = u.getSummaryId(i3), g = u.getSummaryId(o);
      let m = u.getIndexById(o);
      c === "before" && (m -= 1);
      const p = u.byId(i3), h = u.copy(p, u.byId(o).parent, m + 1);
      a3.source = a3.id, a3.id = h[0][1], p.lazy && (a3.lazy = true), l !== g && g && this.resetSummaryDates(g, "copy-task");
      let y4 = [];
      for (let k2 = 1; k2 < h.length; k2++) {
        const [_4, x3] = h[k2];
        f.forEach((w) => {
          if (w.source === _4) {
            const v = { ...w };
            delete v.target, y4.push({ ...v, source: x3 });
          } else if (w.target === _4) {
            const v = { ...w };
            delete v.source, y4.push({ ...v, target: x3 });
          }
        });
      }
      y4 = y4.reduce((k2, _4) => {
        const x3 = k2.findIndex((w) => w.id === _4.id);
        return x3 > -1 ? k2[x3] = { ...k2[x3], ..._4 } : k2.push(_4), k2;
      }, []);
      for (let k2 = 1; k2 < h.length; k2++) {
        const [_4, x3] = h[k2], w = u.byId(x3);
        n.exec("copy-task", { source: _4, id: x3, lazy: !!w.lazy, eventSource: "copy-task", target: w.parent, mode: "child", skipUndo: true });
      }
      y4.forEach((k2) => {
        n.exec("add-link", { link: { source: k2.source, target: k2.target, type: k2.type }, eventSource: "copy-task", skipUndo: true });
      }), this.setStateAsync({ tasks: u });
    }), n.on("open-task", ({ id: a3, mode: i3 }) => {
      const { tree: o } = this.getState(), c = o.byId(a3);
      c.lazy ? n.exec("request-data", { id: c.id }) : (o.toArray().forEach((d) => d.$y = 0), o.update(a3, { open: i3 }), this.setState({ tree: o }));
    }), n.on("scroll-chart", ({ left: a3, top: i3, date: o }) => {
      const { _chartWidth: c, _chartHeight: d, _tasks: u, cellHeight: f, _scales: l, cellWidth: g, _start: m, _weekStart: p } = this.getState();
      let h = {};
      if (o) {
        const y4 = l.diff(o, m, "hour");
        a3 = Math.round(y4 * g);
      }
      if (!isNaN(a3)) {
        if (typeof c < "u" && !isNaN(l.width)) {
          const y4 = l.width - c;
          a3 = Math.max(Math.min(a3, y4), 0);
        }
        h = { scrollLeft: a3, _scaleDate: we(a3, { _scales: l, _start: m, _weekStart: p }), _zoomOffset: null };
      }
      if (!isNaN(i3)) {
        if (typeof d < "u") {
          const y4 = l.height + u.length * f - d;
          i3 = Math.max(Math.min(i3, y4), 0);
        }
        h.scrollTop = i3;
      }
      this.setState(h);
    }), n.on("render-data", (a3) => {
      this.setState({ area: a3 });
    }), n.on("provide-data", (a3) => {
      const { tasks: i3, links: o, assignments: c, durationUnit: d, splitTasks: u } = this.getState(), f = i3.byId(a3.id);
      f.lazy ? (f.lazy = false, f.open = true) : f.data = [], Ct(a3.data.tasks, { durationUnit: d }, this.getTaskCalendar.bind(this)), i3.parse(a3.data.tasks, a3.id), f.type === "summary" && this.resetSummaryDates(f.id, "provide-data");
      const l = { tasks: i3, links: new K2(o.map((g) => g).concat(Wt2(a3.data.links))) };
      a3.data.assignments && c && (l.assignments = new K2(c.map((g) => g).concat(normalizeAssignments(a3.data.assignments)))), this.setStateAsync(l);
    }), n.on("zoom-scale", ({ dir: a3, ratio: i3, offset: o }) => {
      const c = this.getState(), { zoom: d, cellWidth: u, _cellWidth: f, scrollLeft: l } = c, g = (o || 0) + l, m = we(g, c), p = a3 < 0 && f || u;
      let h = Math.round(p * (1 + a3 * (i3 ?? 0.15)));
      const { maxCellWidth: y4, minCellWidth: k2 } = d.levels[d.level], _4 = a3 < 0 && u > y4;
      if (this.shouldExpandScale(h)) {
        this.changeScale(d, a3) && this.setState({ cellWidth: h, _cellWidth: h });
        return;
      }
      if (h < k2 || h > y4 || _4) {
        if (!this.changeScale(d, a3)) if (h = Math.max(Math.min(h, y4), k2), h !== u) this.setState({ cellWidth: h, _cellWidth: h });
        else return;
      } else this.setState({ cellWidth: h, _cellWidth: h });
      const { _scales: x3, _start: w, cellWidth: v, _weekStart: $2 } = this.getState(), M2 = C(x3.minUnit, w, $2), T4 = x3.diff(m, M2, "hour");
      typeof o > "u" && (o = v);
      let D4 = Math.round(T4 * v) - o;
      D4 < 0 && (D4 = 0), this.setState({ scrollLeft: D4, _scaleDate: m, _zoomOffset: o });
    }), n.on("sort-tasks", ({ key: a3, order: i3, add: o }) => {
      const c = this.getState(), { tasks: d, tree: u, columns: f } = c;
      let l = c._sort;
      const g = { key: a3, order: i3 };
      let m = l?.length || 0;
      m && o ? (l.forEach((p, h) => {
        p.key === a3 && (m = h);
      }), l[m] = g) : l = [g], u.sort(l, f), this.setState({ _sort: l, tree: u });
    }), n.on("filter-tasks", (a3) => {
      const { open: i3, key: o, value: c } = a3;
      let d = a3.filter;
      const u = this.getState(), { tasks: f, columns: l } = u;
      let g = u.filterValues;
      o ? g = { ...g, [o]: c } : Object.keys(a3).length || (g = {}), !d && Object.values(g).some((m) => m || m === 0) && (d = Je(g, l)), f.filterTree(d, i3 ?? true), this.setState({ tasks: f, _isFiltered: !!d, filterValues: g });
    }), n.on("hotkey", ({ key: a3, event: i3, eventSource: o }) => {
      switch (a3) {
        case "arrowup":
        case "arrowdown": {
          const { selected: c, _tasks: d } = this.getState();
          i3.preventDefault();
          const u = c.length;
          let f;
          if (a3 === "arrowup" ? f = u ? this.getPrevRow(c[u - 1])?.id : d[d.length - 1]?.id : f = u ? this.getNextRow(c[u - 1])?.id : d[0]?.id, f) {
            const l = o === "chart" ? "xy" : true, g = o;
            this.in.exec("select-task", { id: f, show: l, focus: g });
          }
          break;
        }
        case "ctrl+c": {
          V2(this, "copy-task", null, null);
          break;
        }
        case "ctrl+x": {
          V2(this, "cut-task", null, null);
          break;
        }
        case "ctrl+v": {
          V2(this, "paste-task", null, null);
          break;
        }
        case "ctrl+d":
        case "backspace": {
          i3.preventDefault(), V2(this, "delete-task", null, null);
          break;
        }
        case "ctrl+z": {
          this.in.exec("undo", {});
          break;
        }
        case "ctrl+y": {
          this.in.exec("redo", {});
          break;
        }
      }
    }), n.on("resize-chart", ({ width: a3, height: i3, scrollSize: o }) => {
      let c = {};
      const d = this.getState();
      a3 > d._scales?.width && (c = Xs(a3, d)), this.setState({ ...c, _chartWidth: a3, _chartHeight: i3, _scrollSize: o });
    }), n.on("resize-grid", ({ width: a3 }) => {
      this.setState({ gridWidth: a3 });
    }), n.on("set-columns", ({ columns: a3 }) => {
      const i3 = this.getState().columns.map((o) => {
        const c = a3.find((d) => d.id === o.id);
        return c ? { ...o, width: c.width, hidden: c.hidden, flexgrow: c.flexgrow } : o;
      });
      De(i3), this.setState({ columns: i3 });
    }), n.on("set-display-mode", ({ mode: a3 }) => {
      this.getState()._compactMode && a3 === "all" || this.setState({ displayMode: a3 });
    }), n.on("open-resource-row", ({ id: a3, mode: i3 }) => {
      const { resources: o } = this.getState();
      o.update(a3, { open: i3 }), this.setState({ resources: o });
    }), n.on("sort-resources", ({ key: a3, order: i3, add: o, _columns: c }) => {
      const d = this.getState(), { resources: u } = d;
      let f = d._resourceSort;
      const l = { key: a3, order: i3 };
      let g = f?.length || 0;
      g && o ? (f.forEach((m, p) => {
        m.key === a3 && (g = p);
      }), f[g] = l) : f = [l], u.sort(f, c), this.setState({ _resourceSort: f, resources: u });
    });
  }
  init(t2) {
    const n = this.getState().area ? {} : { scrollLeft: 0, scrollTop: 0, area: { from: 0, start: 0, end: 0 }, xArea: { from: 0, to: 0, start: 0, end: 0 }, _isFiltered: false, filterValues: {}, groupBy: { field: null }, tree: [] };
    t2.cellWidth && (t2._cellWidth = t2.cellWidth), t2._compactMode && t2.displayMode !== this.getState().displayMode && (t2.displayMode = t2.displayMode === "all" ? "grid" : t2.displayMode), t2.unscheduledTasks = false, t2.baselines = false, t2.markers = [], t2._markers = [], t2.undo = false, t2.schedule = {}, t2.criticalPath = null, t2.splitTasks = false, t2.summary = {}, t2.rollups = false, t2._rollups = {}, t2.slack = false, t2.resources = null, t2._resources = [], t2.assignments = [], t2.calendar = null, t2.calendars = [], t2._calendar = null, t2._calendars = {}, t2.groupBy = null, t2.wbs = null;
    const s = this.getState();
    if (Array.isArray(t2.calendars) && t2.calendars.length > 0 ? s.calendars === t2.calendars ? t2._calendars = s._calendars : (t2._calendars = {}, t2.calendars.forEach(({ id: o, ...c }) => {
      t2._calendars[o] = new It(c), t2._calendars[o].css = c.css;
    })) : s._calendars || (t2._calendars = {}), s.calendar === t2.calendar && s._calendar) t2._calendar = s._calendar;
    else if (typeof t2.calendar == "string") {
      const o = t2._calendars?.[t2.calendar];
      o && (t2._calendar = o);
    } else t2.calendar && typeof t2.calendar == "object" ? t2._calendar = new It(t2.calendar) : t2.calendar === true && (t2._calendar = new It());
    t2._calendar && t2.tasks && (t2.highlightTime = (o, c) => {
      const d = this.getCalendar();
      return d && (c === "day" || c === "hour") && !d.isWorkingDay(o) ? "wx-weekend" : "";
    });
    const r2 = this.changed(t2, "tasks"), a3 = this.changed(t2, "links"), i3 = this.changed(t2, "resources");
    this.changed(t2, "projectStart"), r2 || a3 || this.changed(t2, "criticalPath", "slack", "unscheduledTasks");
    for (const o in t2) o[0] !== "_" && (this._prevConfig[o] = t2[o]);
    if (t2.tasks) if (r2) {
      const o = t2.tasks.map((c) => {
        const d = { ...c };
        return c.segments && (d.segments = c.segments.map((u) => ({ ...u }))), d;
      });
      Ct(o, { durationUnit: t2.durationUnit, splitTasks: t2.splitTasks }, (c) => {
        const d = c?.calendar;
        return d != null && t2._calendars?.[d] ? t2._calendars[d] : t2._calendar;
      }), t2.tasks = o;
    } else delete t2.tasks;
    if (r2) {
      this.getHistory()?.resetHistory();
      const o = this.getState();
      o._isFiltered && this.setState({ _isFiltered: false, filterValues: {} }), o._sort && this.setState({ _sort: null });
    }
    i3 && this.getState()._resourceSort && this.setState({ _resourceSort: null }), this._router.init({ selected: [], markers: [], autoScale: true, durationUnit: "day", highlightTime: null, focusTask: null, gridWidth: 440, _compactMode: false, _sort: null, _resourceSort: null, ...n, ...t2 });
  }
  changed(t2, ...n) {
    return n.some((s) => {
      if (!(s in t2)) return false;
      const r2 = this._prevConfig[s], a3 = t2[s];
      return r2 !== a3 && !J2(r2, a3);
    });
  }
  setState(t2, n) {
    return this._router.setState(t2, n);
  }
  setStateAsync(t2) {
    this._router.setStateAsync(t2);
  }
  getTask(t2) {
    const { tree: n } = this.getState();
    return n.byId(t2);
  }
  getResource(t2) {
    const { resources: n } = this.getState();
    return n.byId(t2);
  }
  getHistory() {
    return this.getState().undo ? this._modules.get("historyManager") : null;
  }
  getCalendar(t2) {
    const { _calendar: n, _calendars: s } = this.getState();
    return s?.[t2] ?? n ?? void 0;
  }
  getTaskCalendar(t2) {
    return this.getCalendar(t2?.calendar);
  }
  getResourceCalendar(t2) {
    return this.getCalendar(t2?.calendar);
  }
  getLoadHours(t2, n, s) {
    const r2 = this.getTaskCalendar(n), a3 = this.getResourceCalendar(s);
    return r2 && a3 ? Math.min(r2.getWorkingHours(t2), a3.getWorkingHours(t2)) : a3?.getWorkingHours(t2) ?? r2?.getWorkingHours(t2);
  }
  getGrouping() {
    return this.getState().groupBy?.field ? this._modules.get("groupManager") : null;
  }
  serialize(t2) {
    const n = t2?.data || "tasks";
    if (n === "calendars") {
      const { _calendars: r2 } = this.getState();
      return r2 ? Object.entries(r2).map(([a3, i3]) => ({ ...i3?.serialize?.() || {}, ...i3?.css ? { css: i3.css } : {}, id: a3 })) : null;
    }
    const s = this.getState()[n];
    if (s) {
      if (s instanceof Gt) return s.serialize();
      if (s instanceof K2) return s.map((r2) => r2);
      if (s instanceof Bt2) return s.toArray();
    }
    return null;
  }
  getTaskResources(t2) {
    const { _assignments: n, resources: s } = this.getState();
    if (!s || !n) return [];
    const r2 = n.byTask[t2];
    return r2 ? r2.map((a3) => {
      const i3 = s.byId(a3.resource), o = { ...a3 };
      return delete o.resource, delete o.task, i3 ? { ...o, ...i3, assignmentId: a3.id } : null;
    }).filter(Boolean) : [];
  }
  getResourceTasks(t2) {
    const { _assignments: n, tasks: s } = this.getState();
    if (!n) return [];
    const r2 = n.byResource[t2];
    return r2 ? r2.map((a3) => s.byId(a3.task) || null).filter(Boolean) : [];
  }
  changeScale(t2, n) {
    const s = t2.level + n, r2 = t2.levels[s];
    if (r2) {
      const { cellWidth: a3, scales: i3, _scales: o } = this.getState(), c = qs(t2, n, s, r2, o.lengthUnit, i3, a3);
      return c._cellWidth = c.cellWidth, this.setState(c), true;
    }
    return false;
  }
  shouldExpandScale(t2) {
    const { start: n, end: s, _chartWidth: r2, _scales: a3, cellWidth: i3 } = this.getState();
    return n && s && r2 && a3?.width && i3 ? a3.width / i3 * t2 < r2 : false;
  }
  isScheduled(t2) {
    return this.getState().unscheduledTasks ? t2.some((n) => !n.unscheduled || n.data && this.isScheduled(n.data)) : true;
  }
  resetSummaryDates(t2, n, s) {
    const { tasks: r2, durationUnit: a3, splitTasks: i3 } = this.getState(), o = r2.byId(t2), c = o.data;
    if (c?.length && this.isScheduled(c)) {
      const d = Tt2({ ...o, start: void 0, end: void 0, duration: void 0 });
      if (!j(o.start, d.start) || !j(o.end, d.end)) {
        s ? (z(d, { durationUnit: a3 }, this.getTaskCalendar(d)), r2.update(t2, d)) : this.in.exec("update-task", { id: t2, task: d, eventSource: n, skipUndo: true });
        const u = r2.getSummaryId(t2);
        u && this.resetSummaryDates(u, n);
      }
    }
  }
  moveSummaryKids(t2, n, s) {
    const { tasks: r2 } = this.getState();
    t2.data.forEach((a3) => {
      const i3 = { ...r2.byId(a3.id), start: n(a3.start, a3) };
      delete i3.end, delete i3.id, this.in.exec("update-task", { id: a3.id, task: i3, eventSource: s, skipUndo: true }), a3.data?.length && this.moveSummaryKids(a3, n, s);
    });
  }
  getNextRow(t2) {
    const n = this.getState()._tasks, s = n.findIndex((r2) => r2.id === t2);
    return n[s + 1];
  }
  getPrevRow(t2) {
    const n = this.getState()._tasks, s = n.findIndex((r2) => r2.id === t2);
    return n[s - 1];
  }
  scrollToTask(t2, n) {
    const { _chartWidth: s, _chartHeight: r2, scrollLeft: a3, scrollTop: i3, cellWidth: o, cellHeight: c, _tasks: d, _scrollSize: u } = this.getState(), f = d.findIndex((h) => h.id === t2 || h.$id === t2);
    if (f < 0) return;
    const l = this.getTask(d[f].id), g = {};
    if (n?.toString().indexOf("x") !== -1) {
      if (l.$x + l.$w / 2 < a3) g.left = Math.max(l.$x - (o || 0), 0);
      else if (l.$x + l.$w / 2 >= s + a3) {
        const h = s < l.$w ? o : l.$w;
        g.left = l.$x - s + h;
      }
    }
    const m = f * c;
    let p = null;
    m < i3 ? p = m : m + c > i3 + r2 && (p = m - r2 + c + u), p !== null && (g.top = Math.max(p, 0)), this.in.exec("scroll-chart", g);
  }
};
function ga(e, t2, n, s) {
  if (typeof document > "u") return "";
  const r2 = document.createElement("canvas");
  {
    const a3 = ma(r2, e, t2, 1, n);
    pa(a3, s, 0, e, 0, t2);
  }
  return r2.toDataURL();
}
function ma(e, t2, n, s, r2) {
  e.setAttribute("width", (t2 * s).toString()), e.setAttribute("height", (n * s).toString());
  const a3 = e.getContext("2d");
  return a3.translate(-0.5, -0.5), a3.strokeStyle = r2, a3;
}
function pa(e, t2, n, s, r2, a3) {
  e.beginPath(), e.moveTo(s, r2), e.lineTo(s, a3), t2 === "full" && e.lineTo(n, a3), e.stroke();
}
var Pt2 = [{ id: "task", label: "Task" }, { id: "summary", label: "Summary task" }, { id: "milestone", label: "Milestone" }];
function Fe2(e) {
  return !e.$group && typeof e.$groupValue < "u";
}
function ya(e) {
  return e.$group;
}
function ka(e) {
  let t2 = ze.map((r2) => ({ ...r2 }));
  const n = e?.taskTypes || Pt2, s = t2.find((r2) => r2.id === "convert-task");
  return s.data = [], n.forEach((r2) => {
    (!e?.summary?.autoConvert || r2.id !== "summary") && s.data.push(s.dataFactory(r2));
  }), t2;
}
function Et(e) {
  return e.map((t2) => {
    switch (t2.data && Et(t2.data), t2.id) {
      case "add-task:before":
      case "move-task:up":
        t2.isDisabled = (n, s) => wa(n, s) || Fe2(n) || ya(n);
        break;
      case "move-task:down":
        t2.isDisabled = (n, s) => ba(n, s);
        break;
      case "indent-task:add":
        t2.isDisabled = (n, s) => xa(n, s) === n.parent;
        break;
      case "indent-task:remove":
        t2.isDisabled = (n) => _a(n);
        break;
    }
    return t2;
  });
}
function _a(e) {
  return e.parent === 0;
}
function wa(e, t2) {
  const { _tasks: n } = t2;
  return n[0]?.id === e.id;
}
function ba(e, t2) {
  const { _tasks: n } = t2;
  return n[n.length - 1]?.id === e.id;
}
function xa(e, t2) {
  const { _tasks: n } = t2, s = n.findIndex((r2) => r2.id === e.id);
  return n[s - 1]?.id ?? e.parent;
}
function Sa(e) {
  return e && typeof e == "object";
}
function va(e) {
  return !e.selected || e.selected.length < 2;
}
var Ma = (e) => (t2) => t2.type === e || e === "summary" && Fe2(t2);
var ze = Et([{ id: "add-task", text: "Add", icon: "wxi-plus", data: [{ id: "add-task:child", text: "Child task" }, { id: "add-task:before", text: "Task above" }, { id: "add-task:after", text: "Task below" }] }, { comp: "separator" }, { id: "convert-task", text: "Convert to", icon: "wxi-swap-horizontal", dataFactory: (e) => ({ id: `convert-task:${e.id}`, text: `${e.label}`, isDisabled: Ma(e.id) }) }, { id: "edit-task", text: "Edit", icon: "wxi-edit" }, { comp: "separator" }, { id: "cut-task", text: "Cut", icon: "wxi-content-cut", subtext: "Ctrl+X" }, { id: "copy-task", text: "Copy", icon: "wxi-content-copy", subtext: "Ctrl+C" }, { id: "paste-task", text: "Paste", icon: "wxi-content-paste", subtext: "Ctrl+V" }, { id: "move-task", text: "Move", icon: "wxi-swap-vertical", data: [{ id: "move-task:up", text: "Up" }, { id: "move-task:down", text: "Down" }] }, { comp: "separator" }, { id: "indent-task:add", text: "Indent", icon: "wxi-indent" }, { id: "indent-task:remove", text: "Outdent", icon: "wxi-unindent" }, { comp: "separator" }, { id: "delete-task", icon: "wxi-delete", text: "Delete", subtext: "Ctrl+D / BS", isHidden: (e, t2, n) => va(t2) && Sa(n) }]);
var Be2 = Et([{ id: "add-task", comp: "button", icon: "wxi-plus", text: "New task", type: "primary" }, { id: "edit-task", comp: "icon", icon: "wxi-edit", menuText: "Edit", text: "Ctrl+E" }, { id: "delete-task", comp: "icon", icon: "wxi-delete", menuText: "Delete", text: "Ctrl+D, Backspace" }, { comp: "separator" }, { id: "move-task:up", comp: "icon", icon: "wxi-angle-up", menuText: "Move up" }, { id: "move-task:down", comp: "icon", icon: "wxi-angle-down", menuText: "Move down" }, { comp: "separator" }, { id: "copy-task", comp: "icon", icon: "wxi-content-copy", menuText: "Copy", text: "Ctrl+V" }, { id: "cut-task", comp: "icon", icon: "wxi-content-cut", menuText: "Cut", text: "Ctrl+X" }, { id: "paste-task", comp: "icon", icon: "wxi-content-paste", menuText: "Paste", text: "Ctrl+V" }, { comp: "separator" }, { id: "indent-task:add", comp: "icon", icon: "wxi-indent", menuText: "Indent" }, { id: "indent-task:remove", comp: "icon", icon: "wxi-unindent", menuText: "Outdent" }]);

// node_modules/@svar-ui/lib-react/dist/index.js
import { useState as useState2, useRef as useRef2, useEffect as useEffect2 } from "react";

// node_modules/@svar-ui/lib-react/node_modules/@svar-ui/lib-dom/dist/index.js
function locate3(el, attr = "data-id") {
  let node = el;
  if (!node.tagName && el.target)
    node = el.target;
  while (node) {
    if (node.getAttribute) {
      const id32 = node.getAttribute(attr);
      if (id32) return node;
    }
    node = node.parentNode;
  }
  return null;
}
function getID2(el, attr = "data-id") {
  const value = el.getAttribute(attr);
  if (!value) return null;
  return id4(value);
}
function id4(value) {
  if (value.startsWith(":")) return value.substring(1);
  const t2 = value * 1;
  if (!isNaN(t2)) return t2;
  return value;
}
function getEnv3() {
  return {
    detect: () => true,
    addEvent: function(node, event, handler) {
      node.addEventListener(event, handler);
      return () => node.removeEventListener(event, handler);
    },
    addGlobalEvent: function(event, handler) {
      document.addEventListener(event, handler);
      return () => document.removeEventListener(event, handler);
    },
    getTopNode: function() {
      return window.document.body;
    }
  };
}
var env3 = getEnv3();
var id23 = (/* @__PURE__ */ new Date()).valueOf();

// node_modules/@svar-ui/lib-react/dist/index.js
function useWritableProp2(propValue) {
  const [value, setValue] = useState2(propValue);
  const prevPropRef = useRef2(propValue);
  useEffect2(() => {
    if (prevPropRef.current !== propValue) {
      if (Array.isArray(prevPropRef.current) && Array.isArray(propValue) && prevPropRef.current.length === 0 && propValue.length === 0)
        return;
      prevPropRef.current = propValue;
      setValue(propValue);
    }
  }, [propValue]);
  return [value, setValue];
}
function useWritable(writable2, initialValue, name) {
  const [state, setState] = useState2(() => initialValue);
  if (!writable2) console.warn(`Writable ${name} is not defined`);
  useEffect2(() => {
    if (!writable2) return;
    const unsubscribe = writable2.subscribe((newValue) => {
      setState(() => newValue);
    });
    return unsubscribe;
  }, [writable2]);
  return state;
}
function useStore(store, name) {
  const s = store.getState();
  const r2 = store.getReactiveState();
  return useWritable(r2[name], s[name], name);
}
function useStoreLater(store, name) {
  const [state, setState] = useState2(() => null);
  useEffect2(() => {
    if (!store) return;
    const r2 = store.getReactiveState();
    const wr = r2 ? r2[name] : null;
    if (!wr) return;
    const unsubscribe = wr.subscribe((newValue) => setState(() => newValue));
    return unsubscribe;
  }, [store, name]);
  return state;
}
function useWritableWithCounter(writable2, initialValue) {
  const state = useRef2(initialValue);
  state.current = initialValue;
  const [counter, setCounter] = useState2(1);
  useEffect2(() => {
    const unsubscribe = writable2.subscribe((newValue) => {
      state.current = newValue;
      setCounter((v) => v + 1);
    });
    return unsubscribe;
  }, [writable2]);
  return [state.current, counter];
}
function useStoreWithCounter(store, name) {
  const s = store.getState();
  const r2 = store.getReactiveState();
  return useWritableWithCounter(r2[name], s[name]);
}
function styleObject(text) {
  const out = {};
  text.split(";").forEach((x3) => {
    const [k2, v] = x3.split(":");
    if (v) {
      let n = k2.trim();
      if (n.indexOf("-")) n = n.replace(/-([a-z])/g, (_4, c) => c.toUpperCase());
      out[n] = v.trim();
    }
  });
  return out;
}
function writable(value) {
  let _value = value;
  let listeners = [];
  const subscribe = (cb) => {
    listeners.push(cb);
    cb(_value);
  };
  const unsubscribe = (cb) => {
    listeners = listeners.filter((l) => l !== cb);
  };
  const update = (cb) => {
    _value = cb(_value);
    listeners.forEach((l) => l(_value));
  };
  const set = (v) => {
    _value = v;
    listeners.forEach((l) => l(_value));
  };
  return {
    subscribe,
    unsubscribe,
    set,
    update
  };
}
function delegateEvent2(node, handlers, event) {
  function handleEvent(ev) {
    const node2 = locate3(ev);
    if (!node2) return;
    const id5 = getID2(node2);
    if (typeof handlers === "function") return handlers(id5, ev);
    let action;
    let test = ev.target;
    while (test != node2) {
      action = test.dataset ? test.dataset.action : null;
      if (action) {
        if (handlers[action]) {
          handlers[action](id5, ev);
          return;
        }
      }
      test = test.parentNode;
    }
    if (handlers[event]) handlers[event](id5, ev);
  }
  return env3.addEvent(node, event, handleEvent);
}
function delegateClick2(node, handlers) {
  const result = [delegateEvent2(node, handlers, "click")];
  if (handlers.dblclick)
    result.push(delegateEvent2(node, handlers.dblclick, "dblclick"));
  return () => {
    result.forEach((r2) => r2());
  };
}

// node_modules/@svar-ui/grid-store/dist/index.js
var F3 = (/* @__PURE__ */ new Date()).valueOf();
function V3(r2, e) {
  if (Object.keys(r2).length !== Object.keys(e).length) return false;
  for (const o in e) {
    const t2 = r2[o], i3 = e[o];
    if (!k(t2, i3)) return false;
  }
  return true;
}
function k(r2, e) {
  if (typeof r2 == "number" || typeof r2 == "string" || typeof r2 == "boolean" || r2 === null) return r2 === e;
  if (typeof r2 != typeof e || (r2 === null || e === null) && r2 !== e || r2 instanceof Date && e instanceof Date && r2.getTime() !== e.getTime()) return false;
  if (typeof r2 == "object") if (Array.isArray(r2) && Array.isArray(e)) {
    if (r2.length !== e.length) return false;
    for (let o = r2.length - 1; o >= 0; o--) if (!k(r2[o], e[o])) return false;
    return true;
  } else return V3(r2, e);
  return r2 === e;
}
function D(r2) {
  if (typeof r2 != "object" || r2 === null) return r2;
  if (r2 instanceof Date) return new Date(r2);
  if (r2 instanceof Array) return r2.map(D);
  const e = {};
  for (const o in r2) e[o] = D(r2[o]);
  return e;
}
var M = 2;
var W2 = class {
  constructor(r2) {
    r2 && (this._writable = r2.writable, this._async = r2.async), this._values = {}, this._state = {};
  }
  setState(r2, e = 0) {
    const o = {};
    return this._wrapProperties(r2, this._state, this._values, "", o, e), o;
  }
  getState() {
    return this._values;
  }
  getReactive() {
    return this._state;
  }
  _wrapProperties(r2, e, o, t2, i3, s) {
    for (const a3 in r2) {
      const n = e[a3], c = o[a3], l = r2[a3];
      if (n && (c === l && typeof l != "object" || l instanceof Date && c instanceof Date && c.getTime() === l.getTime())) continue;
      const d = t2 + (t2 ? "." : "") + a3;
      n ? (n.__parse(l, d, i3, s) && (o[a3] = l), s & M ? i3[d] = n.__trigger : n.__trigger()) : (l && l.__reactive ? e[a3] = this._wrapNested(l, l, d, i3) : e[a3] = this._wrapWritable(l), o[a3] = l), i3[d] = i3[d] || null;
    }
  }
  _wrapNested(r2, e, o, t2) {
    const i3 = this._wrapWritable(r2);
    return this._wrapProperties(r2, i3, e, o, t2, 0), i3.__parse = (s, a3, n, c) => (this._wrapProperties(s, i3, e, a3, n, c), false), i3;
  }
  _wrapWritable(r2) {
    const e = [], o = function() {
      for (let t2 = 0; t2 < e.length; t2++) e[t2](r2);
    };
    return { subscribe: (t2) => (e.push(t2), this._async ? setTimeout(t2, 1, r2) : t2(r2), () => {
      const i3 = e.indexOf(t2);
      i3 >= 0 && e.splice(i3, 1);
    }), __trigger: () => {
      e.length && (this._async ? setTimeout(o, 1) : o());
    }, __parse: function(t2) {
      return r2 = t2, true;
    } };
  }
};
var U2 = class {
  constructor(r2, e, o, t2) {
    typeof r2 == "function" ? this._setter = r2 : this._setter = r2.setState.bind(r2), this._routes = e, this._parsers = o, this._prev = {}, this._triggers = /* @__PURE__ */ new Map(), this._sources = /* @__PURE__ */ new Map(), this._routes.forEach((i3) => {
      i3.in.forEach((s) => {
        const a3 = this._triggers.get(s) || [];
        a3.push(i3), this._triggers.set(s, a3);
      }), i3.out.forEach((s) => {
        const a3 = this._sources.get(s) || {};
        i3.in.forEach((n) => a3[n] = true), this._sources.set(s, a3);
      });
    }), this._routes.forEach((i3) => {
      i3.length = Math.max(...i3.in.map((s) => H2(s, this._sources, 1)));
    }), this._bus = t2;
  }
  init(r2) {
    const e = {};
    for (const o in r2) if (this._prev[o] !== r2[o]) {
      const t2 = this._parsers[o];
      e[o] = t2 ? t2(r2[o]) : r2[o];
    }
    this._prev = this._prev ? { ...this._prev, ...r2 } : { ...r2 }, this.setState(e), this._bus && this._bus.exec("init-state", e);
  }
  setStateAsync(r2) {
    const e = this._setter(r2, M);
    return this._async ? Object.assign(this._async.signals, e) : this._async = { signals: e, timer: setTimeout(this._applyState.bind(this), 1) }, e;
  }
  _applyState() {
    const r2 = this._async;
    if (r2) {
      this._async = null, this._triggerUpdates(r2.signals, []);
      for (const e in r2.signals) {
        const o = r2.signals[e];
        o && o();
      }
    }
  }
  setState(r2, e = []) {
    const o = this._setter(r2);
    return this._triggerUpdates(o, e), o;
  }
  _triggerUpdates(r2, e) {
    const o = Object.keys(r2), t2 = !e.length;
    e = e || [];
    for (let i3 = 0; i3 < o.length; i3++) {
      const s = o[i3], a3 = this._triggers.get(s);
      a3 && a3.forEach((n) => {
        e.indexOf(n) == -1 && e.push(n);
      });
    }
    t2 && this._execNext(e);
  }
  _execNext(r2) {
    for (; r2.length; ) {
      r2.sort((o, t2) => o.length < t2.length ? 1 : -1);
      const e = r2[r2.length - 1];
      r2.splice(r2.length - 1), e.exec(r2);
    }
  }
};
function H2(r2, e, o) {
  const t2 = e.get(r2);
  if (!t2) return o;
  const i3 = Object.keys(t2).map((s) => H2(s, e, o + 1));
  return Math.max(...i3);
}
var K3 = class {
  constructor() {
    this._nextHandler = null, this._handlers = {}, this._tag = /* @__PURE__ */ new WeakMap(), this.exec = this.exec.bind(this);
  }
  on(r2, e, o) {
    let t2 = this._handlers[r2];
    t2 ? o && o.intercept ? t2.unshift(e) : t2.push(e) : t2 = this._handlers[r2] = [e], o && o.tag && this._tag.set(e, o.tag);
  }
  intercept(r2, e, o) {
    this.on(r2, e, { ...o, intercept: true });
  }
  detach(r2) {
    for (const e in this._handlers) {
      const o = this._handlers[e];
      for (let t2 = o.length - 1; t2 >= 0; t2--) this._tag.get(o[t2]) === r2 && o.splice(t2, 1);
    }
  }
  async exec(r2, e) {
    const o = this._handlers[r2];
    if (o) for (let t2 = 0; t2 < o.length; t2++) {
      const i3 = o[t2](e);
      if (i3 === false || i3 && i3.then && await i3 === false) return;
    }
    return this._nextHandler && await this._nextHandler.exec(r2, e), e;
  }
  setNext(r2) {
    return this._nextHandler = r2;
  }
};
function B(r2) {
  return (e) => e[r2];
}
function q2(r2) {
  return (e, o) => e[r2] = o;
}
function y2(r2, e) {
  return (e.getter || B(e.id))(r2);
}
function T(r2, e, o) {
  return (e.setter || q2(e.id))(r2, o);
}
function X3(r2, e) {
  const o = document.createElement("a");
  o.href = URL.createObjectURL(r2), o.download = e, document.body.appendChild(o), o.click(), document.body.removeChild(o);
}
function b2(r2, e) {
  let o = y2(r2, e) ?? "";
  return e.template ? o = e.template(o, r2, e) : e.optionsMap && (Array.isArray(o) ? o = o.map((t2) => e.optionsMap.get(t2)).join(", ") : o = e.optionsMap.get(o)), typeof o > "u" ? "" : o + "";
}
function Z2(r2, e) {
  const o = /\n|"|;|,/;
  let t2 = "";
  const i3 = e.rows || `
`, s = e.cols || "	", a3 = r2._columns, n = r2.flatData;
  e.header !== false && a3[0].header && (t2 = P2("header", a3, t2, s, i3));
  for (let c = 0; c < n.length; c++) {
    const l = [];
    for (let d = 0; d < a3.length; d++) {
      let h = b2(n[c], a3[d]);
      o.test(h) && (h = '"' + h.replace(/"/g, '""') + '"'), l.push(h);
    }
    t2 += (t2 ? i3 : "") + l.join(s);
  }
  return e.footer !== false && a3[0].footer && (t2 = P2("footer", a3, t2, s, i3)), t2;
}
function P2(r2, e, o, t2, i3) {
  const s = /\n|"|;|,/;
  for (let a3 = 0; a3 < e[0][r2].length; a3++) {
    const n = [];
    for (let c = 0; c < e.length; c++) {
      let l = (e[c][r2][a3].text || "") + "";
      s.test(l) && (l = '"' + l.replace(/"/g, '""') + '"'), n.push(l);
    }
    o += (o ? i3 : "") + n.join(t2);
  }
  return o;
}
var G2 = "portrait";
var J3 = 100;
var Q3 = "a4";
var ee2 = { a3: { width: 11.7, height: 16.5 }, a4: { width: 8.27, height: 11.7 }, letter: { width: 8.5, height: 11 } };
function te3(r2, e) {
  const o = [];
  let t2 = [], i3 = 0;
  const s = r2.filter((n) => !n.hidden), a3 = ie3(e);
  return s.forEach((n, c) => {
    i3 + n.width <= a3 ? (i3 += n.width, t2.push(n)) : (t2.length && o.push(t2), t2 = [n], i3 = n.width), c === s.length - 1 && t2.length && o.push(t2);
  }), o;
}
function oe2(r2, e, o) {
  const t2 = [];
  return r2.forEach((i3, s) => {
    const a3 = i3[e];
    for (let n = 0; n < o.length; n++) {
      t2[n] || (t2[n] = []);
      const c = { ...a3[n] };
      if (t2[n][s] !== null) {
        if (!s && !c.rowspan && !c.colspan) {
          let l = 1, d = r2[s + l][e][n], h = c.width;
          for (; !d.rowspan && !d.colspan; ) l++, d = r2[s + l][e][n], h += d.width;
          c.colspan = l, c.width = h, c.height = o[n];
        }
        if (t2[n].push(c), !c.collapsed && c.colspan > 1) {
          let l = c.colspan - 1;
          if (c.colspan + s > r2.length) {
            const d = c.colspan - (c.colspan + s - r2.length);
            c.colspan = d, c.width = r2.slice(s, s + l + 1).reduce((h, u) => h + u.width, 0), d > 1 && (l = d - 1);
          }
          for (let d = 0; d < l; d++) t2[n].push(null);
        }
        if (c.rowspan > 1) {
          const l = c.rowspan;
          for (let d = 1; d < l; d++) t2[n + d] || (t2[n + d] = []), t2[n + d].push(null);
        }
      }
    }
    if (i3.collapsed) for (let n = 0; n < t2.length; n++) {
      const c = t2[n], l = c[s];
      if (l && l.collapsed) {
        if (c[s] = null, !n) break;
      } else {
        const d = l || c.findLast((h) => h?.colspan >= 1);
        d && (d.colspan = d.colspan - 1, d.width = d.width - i3.width);
      }
    }
  }), t2.map((i3) => i3.filter((s) => s && s.colspan !== 0));
}
function ie3(r2) {
  const { mode: e, ppi: o, paper: t2 } = r2, { width: i3, height: s } = ee2[t2];
  return se3(e === "portrait" ? i3 : s, o);
}
function se3(r2, e) {
  return r2 * e;
}
function re2(r2 = {}) {
  const { mode: e, ppi: o, paper: t2 } = r2;
  return { mode: e || G2, ppi: o || J3, paper: t2 || Q3 };
}
function ne3(r2, e) {
  return r2.flexgrow ? `min-width:${e}px;width:auto` : `width:${r2.width}px; max-width:${r2.width}px; height:${r2.height}px`;
}
function ae2(r2, e, o) {
  let t2 = r2[o.id];
  if (o.filter.type === "richselect" && t2) {
    const i3 = o.filter.config?.options || e.find(({ id: s }) => s == o.id).options;
    i3 && (t2 = i3.find(({ id: s }) => s == t2).label);
  }
  return t2 ?? "";
}
var A2 = ["resize-column", "hide-column", "update-cell"];
var ce2 = ["delete-row", "update-row", "update-cell"];
var le3 = ["move-item"];
var de3 = ["resize-column", "move-item"];
var he3 = class {
  constructor(e, o, t2) {
    __publicField(this, "undo", []);
    __publicField(this, "redo", []);
    __publicField(this, "progress", {});
    __publicField(this, "in");
    __publicField(this, "getState");
    __publicField(this, "setState");
    __publicField(this, "_previousValues", {});
    this.in = e, this.getState = o, this.setState = t2, this.setHandlers(), this.resetStateHistory();
  }
  getHandlers() {
    return { "add-row": { handler: (e) => ({ action: "delete-row", data: { id: e.id }, source: { action: "add-row", data: e } }) }, "delete-row": { handler: (e) => {
      const { id: o } = e, { data: t2 } = this.getPrev(), i3 = t2.findIndex((s) => s.id === o);
      return { action: "add-row", data: { id: o, row: t2[i3], before: i3 < t2.length - 1 ? t2[i3 + 1].id : void 0 }, source: { action: "delete-row", data: e } };
    } }, "update-cell": { handler: (e) => {
      const { id: o, column: t2 } = e, i3 = this.getRow(o), s = this.getColumn(t2), a3 = y2(i3, s);
      return k(a3, e.value) ? null : { action: "update-cell", data: { id: o, column: t2, value: a3 }, source: { action: "update-cell", data: e } };
    } }, "update-row": { handler: (e) => {
      const { id: o, row: t2 } = e, i3 = this.getRow(o);
      for (const s in t2) Object.keys(i3).includes(s) || (i3[s] = void 0);
      return { action: "update-row", data: { id: o, row: i3 }, source: { action: "update-row", data: e } };
    } }, "copy-row": { handler: (e) => {
      const { id: o } = e, { data: t2 } = this.getState(), i3 = t2.findIndex((a3) => a3.id === o), s = t2[i3];
      return { action: "delete-row", data: { id: o }, source: { action: "add-row", data: { id: o, row: s, before: i3 < t2.length - 1 ? t2[i3 + 1].id : void 0 } } };
    } }, "resize-column": { handler: (e) => {
      const { id: o, width: t2 } = e, i3 = this.getColumn(o), { _sizes: s } = this.getState();
      return { action: "resize-column", data: { id: o, width: i3.width ?? s.columnWidth }, source: { action: "resize-column", data: { id: o, width: t2 } } };
    } }, "hide-column": { handler: (e) => {
      const { id: o } = e, t2 = this.getColumn(o);
      return { action: "hide-column", data: { id: o, mode: t2.hidden }, source: { action: "hide-column", data: e } };
    } }, "collapse-column": { handler: (e) => {
      const { id: o, row: t2, mode: i3 } = e;
      return { action: "collapse-column", data: { id: o, row: t2, mode: typeof i3 == "boolean" ? !i3 : i3 }, source: { action: "collapse-column", data: e } };
    } }, "move-item": { handler: (e) => {
      const { id: o, target: t2, mode: i3 } = e, { flatData: s } = this.getPrev(), a3 = s.findIndex((n) => n.id === o);
      return { action: "move-item", data: { id: o, target: s[a3 + (a3 ? -1 : 1)].id, mode: a3 ? "after" : "before" }, source: { action: "move-item", data: { id: o, target: t2, mode: i3 } } };
    } }, "open-row": { handler: (e) => {
      const { id: o, nested: t2 } = e;
      return { action: "close-row", data: { id: o, nested: t2 }, source: { action: "open-row", data: e } };
    } }, "close-row": { handler: (e) => {
      const { id: o, nested: t2 } = e;
      return { action: "open-row", data: { id: o, nested: t2 }, source: { action: "close-row", data: e } };
    } } };
  }
  resetHistory() {
    this.undo = [], this.redo = [], this.progress = {}, this.resetStateHistory();
  }
  getPrev() {
    return this._previousValues;
  }
  setHandlers() {
    const e = this.getHandlers();
    for (const o in e) this.in.intercept(o, (t2) => {
      if (!(t2.eventSource === "undo" || t2.eventSource === "redo" || t2.skipUndo)) {
        if (de3.includes(o)) {
          (t2.inProgress && !this.progress[o] || typeof t2.inProgress != "boolean") && (le3.includes(o) && this.setPrev("flatData"), A2.includes(o) && this.setPrev("columns")), this.progress[o] = t2.inProgress;
          return;
        }
        ce2.includes(o) && this.setPrev("data"), A2.includes(o) && this.setPrev("columns");
      }
    }), this.in.on(o, (t2) => {
      if (t2.eventSource === "undo" || t2.eventSource === "redo" || t2.skipUndo || t2.inProgress) return;
      const i3 = e[o].handler(t2);
      i3 && this.addToHistory(i3);
    });
  }
  setPrev(e) {
    this._previousValues[e] = D(this.getState()[e]);
  }
  addToHistory(e) {
    this.undo.push(e), this.redo = [], this.setStateHistory();
  }
  handleUndo() {
    if (!this.undo.length) return;
    const e = this.undo.pop();
    this.redo.push({ ...e.source, source: e }), this.in.exec(e.action, { ...e.data, eventSource: "undo" }), this.setStateHistory();
  }
  handleRedo() {
    if (!this.redo.length) return;
    const e = this.redo.pop();
    this.undo.push({ ...e.source, source: e }), this.in.exec(e.action, { ...e.data, eventSource: "redo" }), this.setStateHistory();
  }
  resetStateHistory() {
    this.setState({ history: { undo: 0, redo: 0 } });
  }
  setStateHistory() {
    this.setState({ history: { undo: this.undo.length, redo: this.redo.length } });
  }
  getRow(e) {
    const { data: o } = this.getPrev();
    return this.getState().tree ? this.getTreeRow(o, e) : o.find((t2) => t2.id === e);
  }
  getTreeRow(e, o) {
    for (let t2 = 0; t2 < e.length; t2++) {
      if (e[t2].id === o) return e[t2];
      if (e[t2].data) {
        const i3 = this.getTreeRow(e[t2].data, o);
        if (i3) return i3;
      }
    }
    return null;
  }
  getColumn(e) {
    const { columns: o } = this.getPrev();
    return o.find((t2) => t2.id === e);
  }
};
function fe3() {
  return true;
}
function L3(r2, e) {
  return typeof r2 > "u" || r2 === null ? -1 : typeof e > "u" || e === null ? 1 : r2 === e ? 0 : r2 > e ? 1 : -1;
}
function pe3(r2, e) {
  return -L3(r2, e);
}
function ge2(r2, e) {
  if (typeof e.sort == "function") return function(t2, i3) {
    const s = e.sort(t2, i3);
    return r2 === "asc" ? s : -s;
  };
  const o = r2 === "asc" ? L3 : pe3;
  return function(t2, i3) {
    return o(y2(t2, e), y2(i3, e));
  };
}
function we2(r2, e) {
  if (!r2 || !r2.length) return;
  const o = r2.map((t2) => {
    const i3 = e.find((s) => s.id == t2.key);
    return ge2(t2.order, i3);
  });
  return r2.length === 1 ? o[0] : function(t2, i3) {
    for (let s = 0; s < o.length; s++) {
      const a3 = o[s](t2, i3);
      if (a3 !== 0) return a3;
    }
    return 0;
  };
}
var C2 = 28;
var me2 = 20;
function xe3() {
  if (typeof document > "u") return "willow";
  const r2 = document.querySelector('[class^="wx"][class$="theme"]');
  return r2 ? r2.className.substring(3, r2.className.length - 6) : "willow";
}
function R2(r2, e, o, t2, i3) {
  const s = document.createElement("div"), a3 = document.createElement("div"), n = document.body;
  i3 = i3 ? `${i3}px` : "auto";
  let c, l;
  a3.className = e, s.classList.add(`wx-${o}-theme`), s.style.cssText = `height:auto;position:absolute;top:0px;left:100px;overflow:hidden;width=${i3};white-space:nowrap;`, s.appendChild(a3), n.appendChild(s), typeof r2 != "object" && (r2 = [r2]);
  for (let d = 0; d < r2.length; d++) {
    a3.innerText = r2[d] + "";
    const h = s.getBoundingClientRect(), u = Math.ceil(h.width) + (t2 && t2.length ? t2[d] : 0), f = Math.ceil(h.height);
    c = Math.max(c || 0, u), l = Math.max(l || 0, f);
  }
  return s.remove(), { width: c, height: l };
}
function z2(r2, e, o, t2, i3) {
  const s = [];
  for (let a3 = 0; a3 < r2.length; a3++) {
    const n = r2[a3][e], c = n.length;
    for (let l = 0; l < c; l++) {
      const { text: d, vertical: h, collapsed: u, rowspan: f, css: g } = n[l];
      if (!d) {
        s[l] = Math.max(s[l] || 0, t2);
        continue;
      }
      let p = 0;
      if (h && !u) {
        let w = `wx-measure-cell-${e}`;
        if (w += g ? ` ${g}` : "", p = R2(d, w, i3).width, (f > 1 || !n[l + 1]) && o > l + 1) {
          const x3 = f || o - l, m = s.slice(l, l + x3).reduce((v, _4) => v + _4, 0);
          if (m < p) {
            const v = Math.ceil((p - m) / x3);
            for (let _4 = l; _4 < l + x3; _4++) s[_4] = (s[_4] || t2) + v;
          }
          continue;
        }
      }
      s[l] = Math.max(s[l] || t2, p);
    }
  }
  return s;
}
function ye3(r2, e, o) {
  const t2 = [], i3 = [];
  let s = "wx-measure-cell-body";
  s += r2.css ? ` ${r2.css}` : "";
  for (let a3 = 0; a3 < e.length; a3++) {
    const n = e[a3], c = b2(n, r2);
    c && (t2.push(c), r2.treetoggle ? i3.push(e[a3].$level * C2 + (e[a3].$count ? C2 : 0) + (r2.draggable ? C2 : 0)) : r2.draggable && i3.push(C2));
  }
  return R2(t2, s, o, i3).width;
}
function _e3(r2, e) {
  const o = "wx-measure-cell-header", t2 = r2.sort ? me2 : 0;
  let i3 = r2.header;
  if (typeof i3 == "string") return R2(i3, o, e).width + t2;
  let s;
  Array.isArray(i3) || (i3 = [i3]);
  for (let a3 = 0; a3 < i3.length; a3++) {
    const n = i3[a3], c = typeof n == "string" ? n : n.text, l = o + (typeof n == "string" ? "" : ` ${n.css}`);
    let d = R2(c, l, e).width;
    a3 === i3.length - 1 && (d += t2), s = Math.max(s || 0, d);
  }
  return s;
}
var be3 = { text: (r2, e) => r2 ? r2.toString().toLowerCase().indexOf(e.toLowerCase()) !== -1 : !e, richselect: (r2, e) => typeof e != "number" && !e ? true : r2 == e, datepicker: (r2, e) => e ? r2 && Se3(r2, e) : true, multiselect: (r2, e) => !e || e?.length === 0 ? true : Array.isArray(r2) ? r2?.some((o) => e.includes(o)) : r2 && e.includes(r2) };
function $(r2) {
  return be3[r2];
}
function j2(r2, e) {
  const o = [];
  for (const t2 in r2) {
    const i3 = e.find((c) => c.id == t2), { config: s, type: a3 } = i3.header.find((c) => c.filter).filter, n = r2[t2];
    o.push((c) => {
      const l = y2(c, i3);
      return s?.handler ? s.handler(l, n) : $(a3)(l, n);
    });
  }
  return (t2) => {
    for (let i3 = 0; i3 < o.length; i3++) if (!o[i3](t2)) return false;
    return true;
  };
}
function Se3(r2, e) {
  return r2.getFullYear() === e.getFullYear() && r2.getMonth() === e.getMonth() && r2.getDate() === e.getDate();
}
var ve2 = class extends W2 {
  constructor(e) {
    super({ writable: e, async: false });
    __publicField(this, "in");
    __publicField(this, "_router");
    __publicField(this, "_branches");
    __publicField(this, "_xlsxWorker");
    __publicField(this, "_historyManager");
    const o = { rowHeight: 37, columnWidth: 160, headerHeight: 36, footerHeight: 36 };
    this._router = new U2(super.setState.bind(this), [{ in: ["columns", "sizes", "_skin"], out: ["_columns", "_sizes"], exec: (i3) => {
      const { columns: s, sizes: a3, _skin: n } = this.getState(), c = this.copyColumns(s), l = c.reduce((u, f) => Math.max(f.header.length, u), 0), d = c.reduce((u, f) => Math.max(f.footer.length, u), 0);
      c.forEach(this.setCollapsibleColumns);
      const h = this.normalizeSizes(c, a3, l, d, n);
      for (let u = 0; u < c.length; u++) this.normalizeColumns(c, u, "header", l, h), this.normalizeColumns(c, u, "footer", d, h);
      this.setState({ _columns: c, _sizes: h }, i3);
    } }, { in: ["data", "tree", "_filterIds"], out: ["flatData", "_rowHeightFromData"], exec: (i3) => {
      const { data: s, tree: a3, dynamic: n, _filterIds: c } = this.getState(), l = c && new Set(c), d = a3 ? this.flattenRows(s, [], c) : l ? s.filter((u) => l.has(u.id)) : s, h = !n && d.some((u) => u.rowHeight);
      this.setState({ flatData: d, _rowHeightFromData: h }, i3);
    } }], { sizes: (i3) => ({ ...o, ...i3 }) });
    const t2 = this.in = new K3();
    t2.on("close-editor", ({ ignore: i3 }) => {
      const { editor: s } = this.getState();
      s && (i3 || t2.exec("update-cell", s), this.setState({ editor: null }));
    }), t2.on("open-editor", ({ id: i3, column: s }) => {
      let a3 = this.getState().editor;
      a3 && t2.exec("close-editor", {});
      const n = this.getRow(i3), c = s ? this.getColumn(s) : this.getNextEditor(n);
      if (c?.editor) {
        let l = c.editor;
        if (typeof l == "function" && (l = l(n, c)), !l) return;
        a3 = { column: c.id, id: i3, value: y2(n, c) ?? "", renderedValue: b2(n, c), type: l.type || l }, typeof l == "object" && l.config && (a3.config = l.config, l.config.options && (a3.options = l.config.options)), c.options && !a3.options && (a3.options = c.options), this.setState({ editor: a3 });
      }
    }), t2.on("editor", ({ value: i3 }) => {
      let s = this.getState().editor;
      if (s) {
        s = { ...s }, s.value = i3;
        const a3 = this.getColumn(s.column), n = { ...this.getRow(s.id) };
        T(n, a3, i3), s.renderedValue = b2(n, a3), this.setState({ editor: s });
      }
    }), t2.on("add-row", (i3) => {
      const s = this.getState();
      let { data: a3 } = s;
      const { select: n, _filterIds: c } = s, { row: l, before: d, after: h, select: u } = i3;
      if (i3.id = l.id = i3.id || l.id || E3(), d || h) {
        const g = d || h, p = a3.findIndex((w) => w.id === g);
        a3 = [...a3], a3.splice(p + (h ? 1 : 0), 0, i3.row);
      } else a3 = [...a3, i3.row];
      const f = { data: a3 };
      c && (f._filterIds = [...c, i3.id]), this.setState(f), !(typeof u == "boolean" && !u) && (u || n) && t2.exec("select-row", { id: l.id, show: true });
    }), t2.on("delete-row", (i3) => {
      const { data: s, selectedRows: a3, focusCell: n, editor: c } = this.getState(), { id: l } = i3, d = { data: s.filter((h) => h.id !== l) };
      this.isSelected(l) && (d.selectedRows = a3.filter((h) => h !== l)), c?.id === l && (d.editor = null), this.setState(d), n?.row === l && this.in.exec("focus-cell", { eventSource: "delete-row" });
    }), t2.on("update-cell", (i3) => {
      const s = this.getState();
      let { data: a3 } = s;
      a3 = [...a3];
      const { tree: n } = s, { id: c, column: l, value: d } = i3, h = this.getColumn(l);
      if (n) {
        const u = { ...this._branches[c] };
        T(u, h, d);
        const f = this.updateTreeRow(u);
        u.$parent === 0 && (a3 = f);
      } else {
        const u = a3.findIndex((g) => g.id === c), f = { ...a3[u] };
        T(f, h, d), a3[u] = f;
      }
      this.setState({ data: a3 });
    }), t2.on("update-row", (i3) => {
      let { data: s } = this.getState();
      const { id: a3, row: n } = i3, c = s.findIndex((l) => l.id === a3);
      s = [...s], s[c] = { ...s[c], ...n }, this.setState({ data: s });
    }), t2.on("select-row", ({ id: i3, toggle: s, range: a3, mode: n, show: c, column: l }) => {
      const d = this.getState(), { focusCell: h } = d;
      let { selectedRows: u } = d;
      if (u.length || (a3 = s = false), a3) {
        const { data: f } = this.getState();
        let g = f.findIndex((w) => w.id === u[u.length - 1]), p = f.findIndex((w) => w.id === i3);
        g > p && ([g, p] = [p, g]), f.slice(g, p + 1).forEach((w) => {
          this.isSelected(w.id) || u.push(w.id);
        });
      } else if (s && this.isSelected(i3)) {
        if (n === true) return;
        u = u.filter((f) => f !== i3);
      } else if (s) {
        if (n === false) return;
        u.push(i3);
      } else u = [i3];
      this.setState({ selectedRows: [...u] }), h?.row !== i3 && this.in.exec("focus-cell", { eventSource: "select-row" }), c && this.in.exec("scroll", { row: i3, column: l });
    }), this.in.on("focus-cell", (i3) => {
      const { row: s, column: a3, eventSource: n } = i3, { _columns: c, split: l } = this.getState();
      s && a3 ? (this.setState({ focusCell: { row: s, column: a3 } }), n !== "click" && ((!l.left || c.findIndex((d) => d.id === i3.column) >= l.left) && (!l.right || c.findIndex((d) => d.id === i3.column) < c.length - l.right) ? this.in.exec("scroll", { row: s, column: a3 }) : this.in.exec("scroll", { row: s }))) : this.setState({ focusCell: null });
    }), t2.on("resize-column", (i3) => {
      const { id: s, auto: a3, maxRows: n, inProgress: c, flexgrowFallback: l } = i3;
      if (c === false) return;
      let d = i3.width || 0;
      const h = [...this.getState().columns], u = this.getColumn(s);
      if (a3) {
        if (a3 === "data" || a3 === true) {
          const { flatData: f, _skin: g } = this.getState();
          let p = f.length;
          n && (p = Math.min(n, p));
          const w = f.slice(0, p);
          d = ye3(u, w, g);
        }
        if (a3 === "header" || a3 === true) {
          const { _skin: f } = this.getState();
          d = Math.max(_e3(u, f), d);
        }
      }
      if (u.width = Math.max(17, d), l && u.flexgrow) {
        const f = h.find((g) => g.id === l);
        f && !f.flexgrow && (f.flexgrow = 1);
      }
      delete u.flexgrow, this.setState({ columns: h });
    }), t2.on("hide-column", (i3) => {
      const { id: s, mode: a3 } = i3, n = [...this.getState().columns], c = this.getColumn(s), l = n.reduce((d, h) => d + (h.hidden ? 0 : 1), 0);
      !a3 || l > 1 ? (c.hidden = !c.hidden, this.setState({ columns: n })) : i3.skipUndo = true;
    }), t2.on("sort-rows", (i3) => {
      const { key: s, add: a3, sort: n } = i3, c = this.getState(), { columns: l, data: d, tree: h } = c;
      if (n) {
        const m = [...d];
        m.sort(n), this.setState({ data: m });
        return;
      }
      const { order: u = "asc" } = i3;
      let f = c.sortMarks;
      const g = Object.keys(f), p = g.length;
      !a3 || !p || p === 1 && f[s] ? f = { [s]: { order: u } } : (p === 1 && (f[g[0]] = { ...f[g[0]], index: 0 }), f = { ...f, [s]: { order: u, index: typeof a3 == "number" ? a3 : f[s]?.index ?? p } });
      const w = Object.keys(f).sort((m, v) => f[m].index - f[v].index).map((m) => ({ key: m, order: f[m].order }));
      this.setState({ sortMarks: f });
      const x3 = we2(w, l);
      if (x3) {
        const m = [...d];
        h ? this.sortTree(m, x3) : m.sort(x3), this.setState({ data: m });
      }
    }), t2.on("filter-rows", (i3) => {
      const { value: s, key: a3, filter: n } = i3;
      if (!Object.keys(i3).length) {
        this.setState({ filterValues: {}, _filterIds: null });
        return;
      }
      const c = this.getState(), { data: l, tree: d, _columns: h } = c;
      let u = c.filterValues;
      const f = {};
      a3 && (u = { ...u, [a3]: s }, f.filterValues = u);
      const g = n ?? j2(u, h);
      let p = [];
      d ? p = this.filterTree(l, g, p) : l.forEach((w) => {
        g(w) && p.push(w.id);
      }), f._filterIds = p, this.setState(f);
    }), t2.on("collapse-column", (i3) => {
      const { id: s, row: a3, mode: n } = i3, c = [...this.getState().columns], l = this.getColumn(s).header, d = Array.isArray(l) ? l[a3] : l;
      typeof d == "object" && (d.collapsed = n ?? !d.collapsed, this.setState({ columns: c }));
    }), t2.on("move-item", (i3) => {
      const { id: s, inProgress: a3 } = i3;
      let { target: n, mode: c = "after" } = i3;
      const { data: l, flatData: d, tree: h } = this.getState(), u = d.findIndex((p) => p.id === s);
      let f;
      if (c === "up" || c === "down") {
        if (c === "up") {
          if (u === 0) return;
          f = u - 1, c = "before";
        } else if (c === "down") {
          if (u === d.length - 1) return;
          f = u + 1, c = "after";
        }
        n = d[f] && d[f].id;
      } else f = d.findIndex((p) => p.id === n);
      if (u === -1 || f === -1 || a3 === false) return;
      let g;
      h || (g = this.moveItem(s, n, l, c)), this.setState({ data: h ? this.normalizeTreeRows(g) : g });
    }), t2.on("copy-row", (i3) => {
      const { id: s, target: a3, mode: n = "after" } = i3, c = this.getState(), { flatData: l, _filterIds: d } = c;
      let { data: h } = c;
      const u = this.getRow(s);
      if (!u) return;
      const f = { ...u, id: E3() };
      i3.id = f.id;
      const g = l.findIndex((w) => w.id === a3);
      if (g === -1) return;
      h.splice(g + (n === "after" ? 1 : 0), 0, f), h = [...h];
      const p = { data: h };
      d && (p._filterIds = [...d, f.id]), this.setState(p);
    }), t2.on("open-row", (i3) => {
      const { id: s, nested: a3 } = i3;
      this.toggleBranch(s, true, a3);
    }), t2.on("close-row", (i3) => {
      const { id: s, nested: a3 } = i3;
      this.toggleBranch(s, false, a3);
    }), t2.on("export-data", (i3) => new Promise((s, a3) => {
      const n = i3.format || "csv", c = `${i3.fileName || "data"}.${n}`;
      if (n === "csv") {
        const l = Z2(this.getState(), i3.csv || {});
        i3.download !== false ? X3(new Blob(["\uFEFF" + l], { type: "text/csv" }), c) : i3.result = l, s(true);
      } else a3();
    })), t2.on("hotkey", ({ key: i3, event: s, isInput: a3 }) => {
      switch (i3) {
        case "arrowup": {
          const { flatData: n, focusCell: c, select: l } = this.getState();
          if (s.preventDefault(), a3) return;
          const d = c ? c.column : this._getFirstVisibleColumn()?.id, h = c ? this.getPrevRow(c.row)?.id : n[n.length - 1]?.id;
          d && h && (this.in.exec("focus-cell", { row: h, column: d, eventSource: "key" }), l && this.in.exec("select-row", { id: h }));
          break;
        }
        case "arrowdown": {
          const { flatData: n, focusCell: c, select: l } = this.getState();
          if (s.preventDefault(), a3) return;
          const d = c ? c.column : this._getFirstVisibleColumn()?.id, h = c ? this.getNextRow(c.row)?.id : n[0]?.id;
          d && h && (this.in.exec("focus-cell", { row: h, column: d, eventSource: "key" }), l && this.in.exec("select-row", { id: h }));
          break;
        }
        case "arrowright": {
          const { focusCell: n } = this.getState();
          if (a3) return;
          if (s.preventDefault(), n) {
            const c = this.getNextColumn(n.column, true)?.id;
            c && this.in.exec("focus-cell", { row: n.row, column: c, eventSource: "key" });
          }
          break;
        }
        case "arrowleft": {
          const { focusCell: n } = this.getState();
          if (a3) return;
          if (s.preventDefault(), n) {
            const c = this.getPrevColumn(n.column, true)?.id;
            c && this.in.exec("focus-cell", { row: n.row, column: c, eventSource: "key" });
          }
          break;
        }
        case "tab": {
          const { editor: n, focusCell: c, select: l } = this.getState();
          if (n) {
            s.preventDefault();
            const d = n.column;
            let h = n.id, u = this.getNextEditor(this.getRow(h), this.getColumn(d));
            if (!u) {
              const f = this.getNextRow(h);
              f && (h = f.id, u = this.getNextEditor(f));
            }
            u && (this.in.exec("open-editor", { id: h, column: u.id }), this.in.exec("focus-cell", { row: h, column: u.id, eventSource: "key" }), l && !this.isSelected(h) && this.in.exec("select-row", { id: h }));
          } else c && this.in.exec("focus-cell", { eventSource: "key" });
          break;
        }
        case "shift+tab": {
          const { editor: n, focusCell: c, select: l } = this.getState();
          if (n) {
            s.preventDefault();
            const d = n.column;
            let h = n.id, u = this.getPrevEditor(this.getRow(h), this.getColumn(d));
            if (!u) {
              const f = this.getPrevRow(h);
              f && (h = f.id, u = this.getPrevEditor(f));
            }
            u && (this.in.exec("open-editor", { id: h, column: u.id }), this.in.exec("focus-cell", { row: h, column: u.id, eventSource: "key" }), l && !this.isSelected(h) && this.in.exec("select-row", { id: h }));
          } else c && this.in.exec("focus-cell", { eventSource: "key" });
          break;
        }
        case "escape": {
          const { editor: n } = this.getState();
          n && (this.in.exec("close-editor", { ignore: n.type != "multiselect" }), this.in.exec("focus-cell", { row: n.id, column: n.column, eventSource: "key" }));
          break;
        }
        case "f2": {
          const { editor: n, focusCell: c } = this.getState();
          !n && c && this.in.exec("open-editor", { id: c.row, column: c.column });
          break;
        }
        case "enter": {
          const { focusCell: n, tree: c } = this.getState();
          if (!a3 && c && n && this.getColumn(n.column).treetoggle) {
            const l = this.getRow(n.row);
            if (!l.data) return;
            this.in.exec(l.open ? "close-row" : "open-row", { id: n.row, nested: true });
          }
          break;
        }
        case "home": {
          const { editor: n, focusCell: c } = this.getState();
          if (!n && c) {
            s.preventDefault();
            const l = this._getFirstVisibleColumn()?.id;
            this.in.exec("focus-cell", { row: c.row, column: l, eventSource: "key" });
          }
          break;
        }
        case "ctrl+home": {
          const { editor: n, focusCell: c, flatData: l, select: d } = this.getState();
          if (!n && c) {
            s.preventDefault();
            const h = l[0]?.id, u = this._getFirstVisibleColumn()?.id;
            h && u && (this.in.exec("focus-cell", { row: h, column: u, eventSource: "key" }), d && !this.isSelected(h) && this.in.exec("select-row", { id: h }));
          }
          break;
        }
        case "end": {
          const { editor: n, focusCell: c } = this.getState();
          if (!n && c) {
            s.preventDefault();
            const l = this._getLastVisibleColumn()?.id, d = c.row;
            this.in.exec("focus-cell", { row: d, column: l, eventSource: "key" });
          }
          break;
        }
        case "ctrl+end": {
          const { editor: n, focusCell: c, flatData: l, select: d } = this.getState();
          if (!n && c) {
            s.preventDefault();
            const h = l.at(-1).id, u = this._getLastVisibleColumn()?.id;
            h && u && (this.in.exec("focus-cell", { row: h, column: u, eventSource: "key" }), d && !this.isSelected(h) && this.in.exec("select-row", { id: h }));
          }
          break;
        }
        case "ctrl+z": {
          this.in.exec("undo", {});
          break;
        }
        case "ctrl+y": {
          this.in.exec("redo", {});
          break;
        }
      }
    }), t2.on("scroll", (i3) => {
      const { _columns: s, split: a3, _sizes: n, flatData: c, dynamic: l, _rowHeightFromData: d } = this.getState();
      let h = -1, u = -1, f = 0, g = 0;
      if (i3.column) {
        h = 0;
        const p = s.findIndex((w) => w.id === i3.column);
        f = s[p].width;
        for (let w = a3.left ?? 0; w < p; w++) {
          const x3 = s[w];
          x3.hidden || (h += x3.width);
        }
      }
      if (i3.row && !l) {
        const p = c.findIndex((w) => w.id === i3.row);
        p >= 0 && (d ? (u = c.slice(0, p).reduce((w, x3) => w + (x3.rowHeight || n.rowHeight), 0), g = c[p].rowHeight) : u = n.rowHeight * p);
      }
      this.setState({ scroll: { top: u, left: h, width: f, height: g || n.rowHeight } });
    }), t2.on("scroll-to", (i3) => {
      const s = {};
      i3.top !== void 0 && (s.scrollTop = i3.top), i3.left !== void 0 && (s.scrollLeft = i3.left), Object.keys(s).length && this.setState(s);
    }), t2.on("print", (i3) => {
      const s = re2(i3);
      this.setState({ _print: s }), this.setStateAsync({ _print: null });
    }), t2.on("undo", () => {
      this._historyManager?.handleUndo();
    }), t2.on("redo", () => {
      this._historyManager?.handleRedo();
    }), this.initOnce();
  }
  getXlsxWorker() {
    return Promise.reject(new Error("XLSX export is not included in the EMS Scheduler build"));
  }
  initOnce() {
    const e = { sortMarks: {}, _filterIds: null, data: [], filterValues: {}, scroll: null, scrollLeft: 0, scrollTop: 0, editor: null, focusCell: null, _print: null, history: { undo: 0, redo: 0 }, search: null };
    this._router.init(e);
  }
  init(e) {
    e.hasOwnProperty("_skin") && !e._skin && (e._skin = xe3()), e.columns && e.columns.forEach((o) => {
      o.options && (o.optionsMap = new Map(o.options.map((t2) => [t2.id, t2.label])));
    }), k(this.getState().data, e.data) || (e.tree ? e.data = this.normalizeTreeRows(e.data) : e.data = this.normalizeRows(e.data), this.setState({ _filterIds: null, filterValues: {}, sortMarks: {}, search: null }), this._historyManager && this._historyManager.resetHistory()), e.tree && (e.undo = false, e.reorder = false), e.split?.right && (e.split.right = 0), e.undo && !this._historyManager && (this._historyManager = new he3(this.in, this.getState.bind(this), this.setState.bind(this))), this._router.init({ ...e });
  }
  setState(e, o) {
    return this._router.setState(e, o);
  }
  setStateAsync(e) {
    this._router.setStateAsync(e);
  }
  getRow(e) {
    const { tree: o } = this.getState();
    return o ? this._branches[e] : this.getState().data.find((t2) => t2.id === e);
  }
  getRowIndex(e, o) {
    return o || (o = this.getState().flatData), o.findIndex((t2) => t2.id === e);
  }
  getNextRow(e) {
    const o = this.getState().flatData, t2 = this.getRowIndex(e, o);
    return o[t2 + 1];
  }
  getPrevRow(e) {
    const o = this.getState().flatData, t2 = this.getRowIndex(e, o);
    return o[t2 - 1];
  }
  getColumn(e) {
    return this.getState().columns.find((o) => o.id === e);
  }
  getNextColumn(e, o) {
    const t2 = this.getState()._columns, i3 = t2.findIndex((s) => s.id === e);
    return o ? this._getFirstVisibleColumn(i3 + 1) : t2[i3 + 1];
  }
  getPrevColumn(e, o) {
    const t2 = this.getState()._columns, i3 = t2.findIndex((s) => s.id === e);
    return o ? this._getLastVisibleColumn(i3 - 1) : t2[i3 - 1];
  }
  _getFirstVisibleColumn(e) {
    const o = this.getState()._columns;
    let t2 = e ?? 0;
    for (; t2 < o.length && (o[t2]?.hidden || o[t2]?.collapsed); ) t2++;
    return o[t2];
  }
  _getLastVisibleColumn(e) {
    const o = this.getState()._columns;
    let t2 = e ?? o.length - 1;
    for (; t2 < o.length && (o[t2]?.hidden || o[t2]?.collapsed); ) t2--;
    return o[t2];
  }
  isCellEditable(e, o) {
    const { editor: t2, hidden: i3 } = o;
    return !t2 || i3 ? false : typeof t2 == "function" ? t2(e, o) : true;
  }
  getNextEditor(e, o) {
    let t2 = this.getState().columns;
    if (o) {
      const i3 = t2.findIndex((s) => s.id === o.id);
      t2 = t2.slice(i3 + 1);
    }
    return t2.find((i3) => this.isCellEditable(e, i3));
  }
  getPrevEditor(e, o) {
    let t2 = this.getState().columns;
    if (o) {
      const i3 = t2.findLastIndex((s) => s.id === o.id);
      t2 = t2.slice(0, i3);
    }
    return t2.findLast((i3) => this.isCellEditable(e, i3));
  }
  toggleBranch(e, o, t2) {
    let i3 = this._branches[e], { data: s } = this.getState();
    if (s = [...s], e !== 0) {
      i3 = { ...i3, open: o };
      const a3 = this.updateTreeRow(i3);
      i3.$parent === 0 && (s = a3);
    }
    t2 && i3.data?.length && i3.data.forEach((a3) => {
      const n = this.toggleKids(a3, o, t2);
      e === 0 && (s = n);
    }), this.setState({ data: s });
  }
  toggleKids(e, o, t2) {
    e = { ...e, open: o };
    const i3 = this.updateTreeRow(e);
    return t2 && e.data?.length && e.data.forEach((s) => {
      this.toggleKids(s, o, t2);
    }), i3;
  }
  updateTreeRow(e) {
    const o = e.id;
    this._branches[o] = e;
    const t2 = this._branches[e.$parent], i3 = t2.data.findIndex((s) => s.id === o);
    return t2.data = [...t2.data], t2.data[i3] = e, t2.data;
  }
  isSelected(e) {
    return this.getState().selectedRows.indexOf(e) !== -1;
  }
  findAndRemove(e, o) {
    for (let t2 = 0; t2 < e.length; t2++) {
      if (e[t2].id === o) return e.splice(t2, 1)[0];
      if (e[t2].data) {
        const i3 = [...e[t2].data], s = this.findAndRemove(i3, o);
        if (s) return e[t2] = { ...e[t2], data: i3 }, s;
      }
    }
    return null;
  }
  insertItem(e, o, t2, i3) {
    for (let s = 0; s < e.length; s++) {
      if (e[s].id === o) {
        const a3 = e[s], n = i3 === "before" ? s : s + 1;
        if (a3.data) {
          if (i3 === "before") {
            const c = s > 0 ? e[s - 1] : null;
            return c?.data && c.open ? e[s - 1] = { ...c, data: [...c.data, t2] } : e.splice(n, 0, t2), true;
          } else if (a3.open) return e[s] = { ...a3, data: [t2, ...a3.data] }, true;
        }
        return e.splice(n, 0, t2), true;
      }
      if (e[s].data && (e[s] = { ...e[s], data: [...e[s].data] }, this.insertItem(e[s].data, o, t2, i3))) return true;
    }
    return false;
  }
  moveItem(e, o, t2, i3) {
    const s = [...t2], a3 = this.findAndRemove(s, e);
    return this.insertItem(s, o, a3, i3), s;
  }
  copyColumns(e) {
    const o = [];
    for (let t2 = 0; t2 < e.length; t2++) {
      const i3 = { ...e[t2] };
      this.copyHeaderFooter(i3, "header"), this.copyHeaderFooter(i3, "footer"), o[t2] = i3;
    }
    return o;
  }
  copyHeaderFooter(e, o) {
    let t2 = e[o];
    t2 = Array.isArray(t2) ? [...t2] : [t2], t2.forEach((i3, s) => {
      t2[s] = typeof i3 == "string" ? { text: i3 } : { ...i3 };
    }), e[o] = t2;
  }
  setCollapsibleColumns(e, o, t2) {
    let i3 = e.header;
    for (let s = 0; s < i3.length; s++) {
      const a3 = i3[s];
      if (a3.collapsible && a3.collapsed) {
        if (a3.collapsible !== "first") {
          e.collapsed = true, e.width = 36, a3.vertical = true;
          const c = i3.length - s;
          i3 = i3.slice(0, s + 1), i3[s].rowspan = c;
        }
        const n = a3.colspan;
        if (n) {
          const c = i3[s + 1];
          let l = 1;
          c && c.colspan && !c.collapsed && (l = c.colspan);
          for (let d = l; d < n; d++) {
            const h = t2[o + d];
            h && (h.hidden = true);
          }
        }
      }
    }
  }
  normalizeColumns(e, o, t2, i3, s) {
    const a3 = e[o];
    a3.width || (a3.width = a3.flexgrow ? 17 : s.columnWidth), a3._colindex = o + 1;
    const n = a3[t2], c = s[`${t2}RowHeights`];
    for (let l = 0; l < i3; l++) {
      const d = n[l];
      d.id = a3.id, l === n.length - 1 && (d.rowspan = d.rowspan ? Math.min(d.rowspan, i3 - l) : i3 - l);
      for (let h = 1; h < d.rowspan; h++) {
        n.splice(l + h, 0, { _hidden: true });
        for (let u = 1; u < d.colspan; u++) e[o + u][t2].splice(l + h, 0, {});
      }
      if (d.rowspan) {
        const h = (d.rowspan === i3 ? c : c.slice(l, d.rowspan + l)).reduce((u, f) => u + f, 0);
        d.height = h, l + d.rowspan != i3 && d.height--;
      }
      if (a3.hidden && d.colspan > 1) {
        const h = o + d.colspan;
        let u = o + 1, f = e[u], g = d.colspan;
        for (; u < h && f?.hidden; ) u++, g--, f = e[u];
        f && !f.hidden && g > 1 && (f[t2][l] = { ...d, id: f.id, width: f.width || s.columnWidth, colspan: g - 1 });
      }
      if (d.colspan) {
        let h = a3.width, u = a3.flexgrow || 0;
        const f = d.colspan;
        for (let g = 1; g < f; g++) {
          const p = e[o + g];
          p && (p.hidden ? d.colspan -= 1 : p.flexgrow ? u += p.flexgrow : h += p.width || s.columnWidth), u ? d.flexgrow = u : d.width = h;
        }
      } else d.width = a3.width, d.flexgrow = a3.flexgrow;
      t2 === "header" && d.filter && typeof d.filter == "string" && (d.filter = { type: d.filter });
    }
    n.length > i3 && (n.length = i3), a3[t2] = n;
  }
  normalizeRows(e) {
    for (let o = 0; o < e.length; o++) e[o].id || (e[o].id = E3());
    return e;
  }
  normalizeTreeRows(e, o, t2) {
    return !o && !t2 && (this._branches = { 0: { data: e } }), e.forEach((i3) => {
      i3.id || (i3.id = E3()), i3.$level = o || 0, i3.$parent = t2 || 0, this._branches[i3.id] = i3, i3.data && (i3.data.length ? (i3.$count = i3.data.length, this.normalizeTreeRows(i3.data, i3.$level + 1, i3.id)) : (delete i3.data, delete i3.$count, delete i3.open));
    }), e;
  }
  sortTree(e, o) {
    e.sort(o), e.forEach((t2) => {
      t2.data && this.sortTree(t2.data, o);
    });
  }
  filterTree(e, o, t2) {
    return e.forEach((i3) => {
      o(i3) && t2.push(i3.id), i3.data && this.filterTree(i3.data, o, t2);
    }), t2;
  }
  flattenRows(e, o, t2) {
    const i3 = o;
    return e.forEach((s) => {
      (!t2 || t2.includes(s.id)) && i3.push(s), s.data?.length && s.open !== false && this.flattenRows(s.data, i3, t2);
    }), i3;
  }
  createFilter(e) {
    const { _columns: o } = this.getState(), t2 = [];
    for (const i3 in e) {
      const s = o.find((l) => l.id == i3), { config: a3, type: n } = s.header.find((l) => l.filter).filter, c = e[i3];
      t2.push((l) => {
        const d = y2(l, s);
        return a3?.handler ? a3.handler(d, c) : $(n)(d, c);
      });
    }
    return (i3) => {
      for (let s = 0; s < t2.length; s++) if (!t2[s](i3)) return false;
      return true;
    };
  }
  searchRows(e, o) {
    e = e.trim().toLowerCase();
    const t2 = {};
    if (!e) return t2;
    const { flatData: i3, columns: s } = this.getState(), a3 = o ? s.filter((n) => o[n.id]) : s;
    return i3.forEach((n) => {
      const c = {};
      a3.forEach((l) => {
        const d = b2(n, l);
        String(d).toLowerCase().includes(e) && (c[l.id] = true);
      }), Object.keys(c).length && (t2[n.id] = c);
    }), t2;
  }
  normalizeSizes(e, o, t2, i3, s) {
    const a3 = z2(e, "header", t2, o.headerHeight, s), n = z2(e, "footer", i3, o.footerHeight, s), c = a3.reduce((d, h) => d + h, 0), l = n.reduce((d, h) => d + h, 0);
    return { ...o, headerRowHeights: a3, footerRowHeights: n, headerHeight: c, footerHeight: l };
  }
};
var ke2 = (/* @__PURE__ */ new Date()).valueOf();
function E3() {
  return "temp://" + ke2++;
}
function Ce3(r2, e = "data-id") {
  let o = r2;
  for (!o.tagName && r2.target && (o = r2.target); o; ) {
    if (o.getAttribute && o.getAttribute(e)) return o;
    o = o.parentNode;
  }
  return null;
}
(/* @__PURE__ */ new Date()).valueOf();
var Re3 = class {
  constructor() {
    this.store = /* @__PURE__ */ new Map();
  }
  configure(r2, e) {
    this.node = e;
    for (const o in r2) if (r2[o]) {
      const t2 = o.toLowerCase().replace(/[ ]/g, ""), i3 = r2[o];
      this.store.set(t2, i3);
    }
  }
};
var S2 = [];
var Ee2 = { subscribe: (r2) => {
  De2();
  const e = new Re3();
  return S2.push(e), r2(e), () => {
    const o = S2.findIndex((t2) => t2 === e);
    o >= 0 && S2.splice(o, 1);
  };
} };
var O3 = false;
function De2() {
  O3 || (O3 = true, document.addEventListener("keydown", (r2) => {
    if (S2.length && (r2.ctrlKey || r2.altKey || r2.metaKey || r2.shiftKey || r2.key.length > 1 || r2.key === " ")) {
      const e = [];
      r2.ctrlKey && e.push("ctrl"), r2.altKey && e.push("alt"), r2.metaKey && e.push("meta"), r2.shiftKey && e.push("shift");
      let o = r2.code.replace("Key", "").toLocaleLowerCase();
      r2.key === " " && (o = "space"), e.push(o);
      const t2 = e.join("+");
      for (let i3 = S2.length - 1; i3 >= 0; i3--) {
        const s = S2[i3], a3 = s.store.get(t2) || s.store.get(o);
        a3 && s.node.contains(r2.target) && a3(r2, { key: t2, evKey: o });
      }
    }
  }));
}
var Te2 = { tab: true, "shift+tab": true, arrowup: true, arrowdown: true, arrowright: true, arrowleft: true, enter: true, escape: true, f2: true, home: true, end: true, "ctrl+home": true, "ctrl+end": true, "ctrl+z": true, "ctrl+y": true };
function Ie3(r2, { keys: e, exec: o }) {
  if (!e) return;
  function t2(a3) {
    const n = a3.target;
    return n.tagName === "INPUT" || n.tagName === "TEXTAREA" || Ce3(n, "data-header-id")?.classList.contains("wx-filter") || !!n.closest(".wx-cell.wx-editor");
  }
  const i3 = {};
  for (const a3 in e) {
    const n = e[a3];
    typeof n < "u" && (typeof n == "function" ? i3[a3] = n : n && (i3[a3] = (c) => {
      const l = t2(c);
      o({ key: a3, event: c, isInput: l });
    }));
  }
  const s = Ee2.subscribe((a3) => {
    a3.configure(i3, r2);
  });
  return { destroy: () => {
    s();
  } };
}
function Me3(r2, e) {
  let o = null;
  e.scroll.subscribe((t2) => {
    if (!t2 || t2 === o) return;
    o = t2;
    const { left: i3, top: s, height: a3, width: n } = t2, c = e.getHeight(), l = e.getWidth(), d = e.getScrollMargin();
    if (s >= 0) {
      const h = r2.scrollTop;
      s < h ? r2.scrollTop = s : s + a3 > h + c && (r2.scrollTop = s - c + a3);
    }
    if (i3 >= 0) {
      const h = r2.scrollLeft;
      i3 < h ? r2.scrollLeft = i3 : i3 + n > h + l - d && (r2.scrollLeft = i3 - l + n + d);
    }
  }), e.scrollLeft?.subscribe?.((t2) => {
    requestAnimationFrame(() => {
      Math.abs(r2.scrollLeft - t2) > 1 && (r2.scrollLeft = t2);
    });
  }), e.scrollTop?.subscribe?.((t2) => {
    requestAnimationFrame(() => {
      Math.abs(r2.scrollTop - t2) > 1 && (r2.scrollTop = t2);
    });
  });
}

// node_modules/@svar-ui/react-grid/dist/index.es.js
import { jsxs as ne5, jsx as i2, Fragment as Re4 } from "react/jsx-runtime";
import tn3, { createContext as nn2, useContext as ee3, useMemo as b3, useRef as I4, useEffect as O4, useCallback as W4, useState as _2, forwardRef as on2, useImperativeHandle as rn2 } from "react";

// node_modules/@svar-ui/grid-locales/locales/en.js
var en_default3 = {
  grid: {
    "Add before": "Add before",
    "Add after": "Add after",
    Copy: "Copy",
    Cut: "Cut",
    Paste: "Paste",
    Delete: "Delete",
    "New row": "New row",
    "Move up": "Move up",
    "Move down": "Move down",
    Undo: "Undo",
    Redo: "Redo",
    selected: "selected"
  }
};

// node_modules/@svar-ui/react-menu/dist/index.es.js
import { jsxs as P3, jsx as i, Fragment as Q4 } from "react/jsx-runtime";
import { useRef as D2, useCallback as I2, useMemo as A3, useState as C3, useEffect as N2, Fragment as _, forwardRef as F4, useImperativeHandle as q3 } from "react";
function V4(s, l) {
  return s.map((e, n) => {
    const r2 = l(e, n);
    return e.data && e.data.length && (r2.data = V4(e.data, l)), r2;
  }).filter(Boolean);
}
function Y2(s, l) {
  const e = [];
  return s.forEach((n) => {
    if (n.data) {
      const r2 = Y2(n.data, l);
      r2.length && e.push({ ...n, data: r2 });
    } else
      l(n) && e.push(n);
  }), e;
}
function j3(s) {
  return V4(s, (l, e) => {
    const n = { ...l, id: l.id || uid() };
    return n.type && (n.comp = n.type), n.comp === "separator" && s[e - 1]?.comp === "separator" ? null : n;
  });
}
var T2 = {};
function se4(s) {
  return T2[s] || s;
}
function ce3({ onClick: s, onShow: l, option: e }) {
  const n = D2(null), r2 = I2(() => {
    l(e.data ? e.id : false, n.current);
  }, [l, e]), w = I2((c) => {
    if (e.data) {
      c.stopPropagation(), l(e.id, n.current);
      return;
    }
    s(c);
  }, [s, l, e]), f = A3(() => e && e.comp ? se4(e.comp) : null, [e]);
  return /* @__PURE__ */ P3(
    "div",
    {
      ref: n,
      className: `wx-cDCz9rZQ wx-option ${e.css || ""} ${e.disabled ? "wx-disabled" : ""}`,
      "data-id": setID(e.id),
      onMouseEnter: r2,
      onClick: w,
      children: [
        e.icon ? /* @__PURE__ */ i("i", { className: `wx-cDCz9rZQ wx-icon ${e.icon}` }) : null,
        e.comp ? f ? /* @__PURE__ */ i(f, { item: e, option: e }) : null : /* @__PURE__ */ P3("span", { className: "wx-cDCz9rZQ wx-value", children: [
          " ",
          e.text,
          " "
        ] }),
        e.subtext ? /* @__PURE__ */ i("span", { className: "wx-cDCz9rZQ wx-subtext", children: e.subtext }) : null,
        e.data ? /* @__PURE__ */ i("i", { className: "wx-cDCz9rZQ wx-sub-icon wxi-angle-right" }) : null
      ]
    }
  );
}
function B2({
  options: s,
  left: l = 0,
  top: e = 0,
  at: n = "bottom",
  parent: r2 = null,
  mount: w = null,
  context: f = null,
  css: c = "",
  onClick: h,
  onCancel: o
}) {
  const [m, p] = C3(-1e4), [g, x3] = C3(-1e4), [u, t2] = C3(20), [M2, H3] = C3(), z4 = D2(null), [$2, y4] = C3(false), [S4, X6] = C3(null), O5 = I2(() => {
    const a3 = calculatePosition(z4.current, r2, n, l, e);
    a3 && (p(a3.x), x3(a3.y), H3(a3.width));
    let b4 = a3?.z ?? 20;
    const L5 = r2 ? getPopupParents(r2) : [];
    let R4 = 0;
    for (const J6 of L5) {
      const K4 = parseInt(getComputedStyle(J6).zIndex, 10);
      K4 > R4 && (R4 = K4);
    }
    R4 >= b4 && (b4 = R4 + 1), t2(b4);
  }, [r2, n, l, e]);
  N2(() => {
    w && w(O5);
  }, []);
  const Z3 = I2(() => {
    y4(false);
  }, []), d = I2((a3, b4) => {
    y4(a3), X6(b4);
  }, []), E4 = A3(() => j3(s), [s]);
  N2(() => {
    O5();
  }, [r2, O5]);
  const v = D2(h), k2 = D2(o), G3 = D2(r2);
  return N2(() => void (v.current = h), [h]), N2(() => void (k2.current = o), [o]), N2(() => void (G3.current = r2), [r2]), N2(() => {
    if (!z4.current) return;
    function a3(b4) {
      k2.current ? k2.current(b4) : v.current && v.current({ action: null, option: null });
    }
    return clickOutside(z4.current, {
      callback: a3,
      modal: true,
      parent: () => G3.current
    }).destroy;
  }, []), /* @__PURE__ */ i(
    "div",
    {
      ref: z4,
      "data-wx-menu": "true",
      className: `wx-XMmAGqVx wx-menu ${c}`,
      style: {
        position: "absolute",
        top: g + "px",
        left: m + "px",
        width: M2,
        zIndex: u
      },
      onMouseLeave: Z3,
      children: E4.map((a3) => /* @__PURE__ */ P3(_, { children: [
        a3.comp === "separator" ? /* @__PURE__ */ i("div", { className: "wx-XMmAGqVx wx-separator" }) : /* @__PURE__ */ i(
          ce3,
          {
            option: a3,
            onShow: d,
            onClick: (b4) => {
              if (!a3.data && !b4.defaultPrevented) {
                const L5 = { context: f, action: a3, option: a3, event: b4 };
                a3.handler && a3.handler(L5), h && h(L5), b4.stopPropagation();
              }
            }
          }
        ),
        a3.data && $2 === a3.id ? /* @__PURE__ */ i(
          B2,
          {
            css: c,
            options: a3.data,
            at: "right-overlap",
            parent: S4,
            context: f,
            onClick: h,
            onCancel: o
          }
        ) : null
      ] }, a3.id))
    }
  );
}
var W3 = F4(function(l, e) {
  const {
    options: n,
    at: r2 = "bottom",
    resolver: w = null,
    dataKey: f = "contextId",
    filter: c = null,
    css: h = "",
    children: o,
    onClick: m
  } = l, [p, g] = C3(null), [x3, u] = C3(null), [t2, M2] = C3(0), [H3, z4] = C3(0), $2 = D2(null), y4 = A3(
    () => `data-${f.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`,
    [f]
  ), S4 = A3(() => p !== null && c ? Y2(n, (d) => c(d, p)) : n, [p, c, n]);
  function X6(d) {
    u(null), m && m(d);
  }
  function O5(d) {
    if ($2.current === d) {
      $2.current = null;
      return;
    }
    u(null), m && m({ action: null, option: null });
  }
  const Z3 = I2(
    (d, E4) => {
      if (!d) {
        u(null);
        return;
      }
      if (d.defaultPrevented) return;
      const v = d.target;
      if (v && v.dataset && v.dataset.menuIgnore) return;
      if (x3 && x3 === v) {
        u(null), d.preventDefault();
        return;
      }
      M2(d.clientX + 1), z4(d.clientY + 1);
      let k2 = typeof E4 < "u" ? E4 : locateID(v, y4);
      w && (k2 = w(k2, d), !k2) || (g(k2), u(v), $2.current = d.nativeEvent || d, d.preventDefault());
    },
    [x3, y4, w]
  );
  return q3(e, () => ({ show: Z3 }), [Z3]), /* @__PURE__ */ P3(Q4, { children: [
    o ? /* @__PURE__ */ i("span", { onClick: Z3, "data-menu-ignore": "true", children: typeof o == "function" ? o() : o }) : null,
    x3 ? /* @__PURE__ */ i(Ue, { children: /* @__PURE__ */ i(
      B2,
      {
        css: h,
        at: r2,
        top: H3,
        left: t2,
        parent: x3,
        context: p,
        onClick: X6,
        onCancel: O5,
        options: S4
      },
      x3
    ) }) : null
  ] });
});
var he4 = F4(function(l, e) {
  const { options: n, at: r2 = "bottom", css: w = "", children: f, onClick: c } = l, [h, o] = C3(null), m = D2(null);
  function p(t2) {
    o(null), c && c(t2);
  }
  function g(t2) {
    if (m.current === t2) {
      m.current = null;
      return;
    }
    o(null), c && c({ action: null, option: null });
  }
  const x3 = I2((t2) => {
    o(t2.target), m.current = t2.nativeEvent || t2, t2.preventDefault();
  }, []);
  q3(e, () => ({ show: x3 }), [x3]);
  function u(t2) {
    let M2 = t2.target;
    for (; !M2.dataset.menuIgnore; )
      o(M2), M2 = M2.parentNode;
  }
  return /* @__PURE__ */ P3(Q4, { children: [
    /* @__PURE__ */ i("span", { onClick: u, "data-menu-ignore": "true", children: f }),
    h ? /* @__PURE__ */ i(Ue, { children: /* @__PURE__ */ i(
      B2,
      {
        css: w,
        at: r2,
        parent: h,
        options: n,
        onClick: p,
        onCancel: g
      }
    ) }) : null
  ] });
});
var xe4 = F4(function(l, e) {
  const {
    options: n,
    at: r2 = "bottom",
    resolver: w = null,
    dataKey: f = "contextId",
    filter: c = null,
    css: h = "",
    children: o,
    onClick: m
  } = l, p = D2(null), g = I2((x3, u) => {
    p.current.show(x3, u);
  }, []);
  return q3(
    e,
    () => ({
      show: g
    }),
    [g]
  ), /* @__PURE__ */ P3(Q4, { children: [
    o ? /* @__PURE__ */ i("span", { onContextMenu: g, "data-menu-ignore": "true", children: o }) : null,
    /* @__PURE__ */ i(
      W3,
      {
        css: h,
        at: r2,
        options: n,
        resolver: w,
        dataKey: f,
        filter: c,
        ref: p,
        onClick: m
      }
    )
  ] });
});

// node_modules/@svar-ui/react-toolbar/dist/index.es.js
import { jsx as t, jsxs as y3, Fragment as J4 } from "react/jsx-runtime";
import { useMemo as B3, useCallback as X4, useState as A4, useRef as S3, useEffect as V5, useLayoutEffect as ne4 } from "react";
var D3 = {};
function I3(n, e) {
  D3[n] = e;
}
function L4({ menu: n = false }) {
  return /* @__PURE__ */ t("div", { className: `wx-z1qpqrvg wx-separator${n ? "-menu" : ""}`, children: " " });
}
function U3() {
  return /* @__PURE__ */ t("div", { className: "wx-1IhFzpJV wx-spacer" });
}
function ie4(n) {
  const { icon: e, title: o, text: l = "", tooltip: i3, css: a3, type: w, disabled: p, menu: x3, onClick: d } = n;
  return x3 ? /* @__PURE__ */ y3("div", { className: "wx-HXpG4gnx wx-item", onClick: d, children: [
    /* @__PURE__ */ t("i", { className: `wx-HXpG4gnx ${e || "wxi-empty"} ${a3 || ""}` }),
    l
  ] }) : /* @__PURE__ */ t(
    le,
    {
      icon: e,
      type: w,
      css: a3,
      title: o,
      text: l,
      tooltip: i3,
      disabled: p,
      onClick: d
    }
  );
}
function ae3(n) {
  const { text: e, value: o, children: l } = n;
  return l ? /* @__PURE__ */ t("div", { className: "wx-PTEZGYcj wx-label", children: l() }) : /* @__PURE__ */ t("div", { className: "wx-PTEZGYcj wx-label", children: o || e });
}
function ue3(n) {
  const { icon: e, title: o, text: l, tooltip: i3, css: a3, type: w, disabled: p, menu: x3, onClick: d } = n;
  return x3 ? /* @__PURE__ */ y3("div", { className: "wx-3cuSqONJ wx-item", onClick: d, children: [
    e ? /* @__PURE__ */ t("i", { className: `wx-3cuSqONJ ${e || ""} ${a3 || ""}` }) : null,
    l
  ] }) : /* @__PURE__ */ t(
    le,
    {
      icon: e,
      type: w,
      css: a3,
      disabled: p,
      title: o,
      tooltip: i3,
      onClick: d
    }
  );
}
function de4({ id: n = "", text: e = "", css: o = "", icon: l = "", onClick: i3 }) {
  function a3() {
    i3 && i3({ id: n });
  }
  return /* @__PURE__ */ y3("div", { className: `wx-U0Bx7pIR wx-label ${o}`, onClick: a3, children: [
    l ? /* @__PURE__ */ t("i", { className: "wx-U0Bx7pIR " + l }) : null,
    e
  ] });
}
I3("button", ie4);
I3("separator", L4);
I3("spacer", U3);
I3("label", ae3);
I3("item", de4);
I3("icon", ue3);

// node_modules/@svar-ui/react-grid/dist/index.es.js
var ce4 = nn2(null);
function $n2(t2, e) {
  const n = new ResizeObserver((r2) => {
    requestAnimationFrame(() => e(r2[0].contentRect));
  });
  return n.observe(t2.parentNode), {
    destroy() {
      n.disconnect();
    }
  };
}
var Rt2 = 5;
var Mn2 = 700;
function Ge3(t2) {
  const e = t2.getBoundingClientRect(), n = document.body, r2 = e.top + n.scrollTop - n.clientTop || 0, h = e.left + n.scrollLeft - n.clientLeft || 0;
  return {
    y: Math.round(r2),
    x: Math.round(h),
    width: t2.offsetWidth,
    height: t2.offsetHeight
  };
}
function lt3(t2, e) {
  const n = Ge3(e);
  return { x: t2.clientX - n.x, y: t2.clientY - n.y };
}
function An2(t2, e) {
  const n = e.current;
  let r2 = null, h, p, c = false, f = false;
  const u = document.createElement("DIV");
  u.className = "wx-drag-zone", u.setAttribute("tabindex", -1);
  function a3() {
    clearTimeout(h), h = null;
  }
  function m(l) {
    const A6 = locate2(l);
    A6 && (r2 = {
      container: u,
      sourceNode: l.target,
      from: getID(A6),
      pos: lt3(l, t2)
    }, p = r2.pos, s(l));
  }
  function s(l) {
    if (!r2) return;
    const A6 = r2.pos = lt3(l, t2);
    if (!c) {
      if (!f && !l?.target?.getAttribute("draggable-data") && Math.abs(p.x - A6.x) < Rt2 && Math.abs(p.y - A6.y) < Rt2)
        return;
      if (D4(l) === false) return H3();
    }
    if (f) {
      const F5 = window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft, T4 = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
      r2.targetNode = document.elementFromPoint(
        l.pageX - F5,
        l.pageY - T4
      );
    } else r2.targetNode = l.target;
    n.move && n.move(l, r2), u.style.left = -(r2.offset ? r2.offset.x : 0) + "px", u.style.top = r2.pos.y + (r2.offset ? r2.offset.y : 0) + "px";
  }
  function v(l) {
    u.parentNode && u.parentNode.removeChild(u), u.innerHTML = "", c && n.end && n.end(l, r2), r2 = p = null, H3();
  }
  function R4(l) {
    n.getReorder && !n.getReorder() || l.button === 0 && (E4(l), window.addEventListener("mousemove", S4), window.addEventListener("mouseup", d), m(l));
  }
  function S4(l) {
    s(l);
  }
  function d(l) {
    v(l);
  }
  function g(l) {
    if (n.getReorder && !n.getReorder()) return;
    h = setTimeout(() => {
      f = true, m(l.touches[0]);
    }, Mn2), E4(l);
    function A6() {
      h && a3(), l.target.removeEventListener("touchmove", y4), l.target.removeEventListener("touchend", A6), v(l);
    }
    l.target.addEventListener("touchmove", y4), l.target.addEventListener("touchend", A6), t2.addEventListener("contextmenu", C4);
  }
  function y4(l) {
    c ? (l.preventDefault(), s(l.touches[0])) : h && a3();
  }
  function C4(l) {
    if (c || h)
      return l.preventDefault(), false;
  }
  function x3(l) {
    l.preventDefault();
  }
  function E4(l) {
    if (!n.getDraggableInfo) return;
    const { hasDraggable: A6 } = n.getDraggableInfo();
    (!A6 || l.target.getAttribute("draggable-data")) && (document.body.style.userSelect = "none", document.body.style.webkitUserSelect = "none");
  }
  function D4(l) {
    if (c = true, n.start) {
      if (n.start(l, r2) === false) return false;
      t2.appendChild(u), document.body.style.cursor = "move";
    }
  }
  function H3(l) {
    c = f = false, document.body.style.cursor = "", document.body.style.userSelect = "", document.body.style.webkitUserSelect = "", window.removeEventListener("mousemove", S4), window.removeEventListener("mouseup", d), l && (t2.removeEventListener("mousedown", R4), t2.removeEventListener("touchstart", g), t2.removeEventListener("dragstart", x3));
  }
  return t2.addEventListener("mousedown", R4), t2.addEventListener("touchstart", g), t2.addEventListener("dragstart", x3), {
    destroy() {
      H3(true);
    }
  };
}
var In2 = 4e-3;
function On2() {
  return {
    dirX: 0,
    dirY: 0,
    scrollSpeedFactor: 1
  };
}
function zn2(t2, e, n, r2) {
  const { node: h, left: p, top: c, bottom: f, sense: u, xScroll: a3, yScroll: m } = r2, s = lt3(t2, h);
  n.scrollState || (n.scrollState = On2());
  let v = 0, R4 = 0;
  s.x < p + u ? v = -1 : s.x > e.width - u && (v = 1), s.y < c + Math.round(u / 2) ? R4 = -1 : s.y > e.height - f - Math.round(u / 2) && (R4 = 1), (n.scrollState.dirX !== v || n.scrollState.dirY !== R4) && (At2(n), n.scrollState.dirX = v, n.scrollState.dirY = R4), (a3 && n.scrollState.dirX !== 0 || m && n.scrollState.dirY !== 0) && Vn2(n, r2, {
    x: n.scrollState.dirX,
    y: n.scrollState.dirY
  });
}
function Vn2(t2, e, n) {
  t2.autoScrollTimer || (t2.autoScrollTimer = setTimeout(() => {
    t2.activeAutoScroll = setInterval(
      Kn2,
      15,
      t2,
      e,
      n
    );
  }, 250));
}
function At2(t2) {
  t2.scrollSpeedFactor = 1, t2.autoScrollTimer && (t2.autoScrollTimer = clearTimeout(t2.autoScrollTimer), t2.activeAutoScroll = clearInterval(t2.activeAutoScroll));
}
function Kn2(t2, e, n) {
  const { x: r2, y: h } = n;
  t2.scrollSpeedFactor += In2, r2 !== 0 && Wn2(t2, e, r2), h !== 0 && Pn2(t2, e, h);
}
function Pn2(t2, e, n) {
  const r2 = e.node.scrollTop;
  It2(
    r2 + Math.round(e.sense / 3) * t2.scrollSpeedFactor * n,
    "scrollTop",
    e
  );
}
function Wn2(t2, e, n) {
  const r2 = e.node.scrollLeft;
  It2(
    r2 + Math.round(e.sense / 3) * t2.scrollSpeedFactor * n,
    "scrollLeft",
    e
  );
}
function It2(t2, e, n) {
  n.node[e] = t2;
}
function Qe2(t2, e, n, r2, h, p) {
  const c = {};
  return t2 && (c.width = `${t2}px`, c.minWidth = `${t2}px`), e && (c.flexGrow = e), p && (c.height = `${p}px`), n && (c.position = "sticky", n.left && (c.left = `${r2}px`), n.right && (c.right = `${h}px`)), c;
}
function Ot2(t2, e, n) {
  let r2 = "";
  if (t2.fixed)
    for (const h in t2.fixed) {
      let p = t2.fixed[h] === -1;
      !p && t2.fixed.leftSize && e.colspan && (p = e.colspan + t2._colindex - 1 === t2.fixed.leftSize), r2 += p ? "wx-shadow " : "wx-fixed ";
    }
  return r2 += e.rowspan > 1 ? "wx-rowspan " : "", r2 += e.colspan > 1 ? "wx-colspan " : "", r2 += e.vertical ? "wx-vertical " : "", r2 += n ? n(t2) + " " : "", r2;
}
function Fn2(t2) {
  const {
    row: e,
    column: n,
    cellStyle: r2 = null,
    columnStyle: h = null,
    children: p,
    focusable: c
  } = t2, f = ee3(ce4), u = useStore(f, "focusCell"), a3 = useStore(f, "search"), m = useStore(f, "reorder"), s = b3(
    () => a3?.rows[e.id] && a3.rows[e.id][n.id],
    [a3, e.id, n.id]
  ), v = b3(
    () => Qe2(
      n.width,
      n.flexgrow,
      n.fixed,
      n.left,
      n.right
    ),
    [n.width, n.flexgrow, n.fixed, n.left, n.right]
  );
  function R4(D4, H3) {
    let l = "wx-cell";
    return l += n.fixed ? " " + (n.fixed === -1 ? "wx-shadow" : "wx-fixed") : "", l += D4 ? " " + D4(n) : "", l += H3 ? " " + H3(e, n) : "", l += n.treetoggle ? " wx-tree-cell" : "", l;
  }
  const S4 = b3(
    () => R4(h, r2),
    [h, r2, n, e]
  ), d = b3(() => typeof n.draggable == "function" ? n.draggable(e, n) !== false : n.draggable, [n, e]), g = I4(null);
  O4(() => {
    g.current && c && u?.row === e.id && u?.column === n.id && g.current.focus();
  }, [u, c, e.id, n.id]);
  const y4 = W4(() => {
    c && !u && f.exec("focus-cell", {
      row: e.id,
      column: n.id,
      eventSource: "focus"
    });
  }, [f, c, u, e.id, n.id]);
  function C4(D4) {
    const H3 = new RegExp(`(${a3.value.trim()})`, "gi");
    return String(D4).split(H3).map((A6) => ({ text: A6, highlight: H3.test(A6) }));
  }
  const x3 = b3(() => {
    const D4 = n.fixed && n.fixed.left === -1 || n.fixed.right === -1, H3 = n.fixed && n.fixed.right;
    return [
      S4,
      D4 ? "wx-shadow" : "",
      H3 ? "wx-fixed-right" : ""
    ].filter(Boolean).join(" ");
  }, [S4, n]), E4 = n.cell;
  return /* @__PURE__ */ ne5(
    "div",
    {
      className: "wx-TSCaXsGV " + x3,
      ref: g,
      onFocus: y4,
      style: v,
      "data-row-id": setID(e.id),
      "data-col-id": setID(n.id),
      tabIndex: c ? "0" : "-1",
      role: "gridcell",
      "aria-colindex": n._colindex,
      "aria-readonly": n.editor ? void 0 : true,
      children: [
        m && n.draggable ? d ? /* @__PURE__ */ i2(
          "i",
          {
            "draggable-data": "true",
            className: "wx-TSCaXsGV wx-draggable wxi-drag"
          }
        ) : /* @__PURE__ */ i2("i", { className: "wx-TSCaXsGV wx-draggable-stub" }) : null,
        n.treetoggle ? /* @__PURE__ */ ne5(Re4, { children: [
          /* @__PURE__ */ i2("span", { style: { marginLeft: `${e.$level * 28}px` } }),
          e.$count ? /* @__PURE__ */ i2(
            "i",
            {
              "data-action": "toggle-row",
              className: `wx-TSCaXsGV wx-table-tree-toggle wxi-menu-${e.open !== false ? "down" : "right"}`
            }
          ) : null
        ] }) : null,
        E4 ? /* @__PURE__ */ i2(
          E4,
          {
            api: f,
            row: e,
            column: n,
            onAction: ({ action: D4, data: H3 }) => f.exec(D4, H3)
          }
        ) : p ? p() : s ? /* @__PURE__ */ i2("span", { children: C4(b2(e, n)).map(
          ({ highlight: D4, text: H3 }, l) => D4 ? /* @__PURE__ */ i2("mark", { className: "wx-TSCaXsGV wx-search", children: H3 }, l) : /* @__PURE__ */ i2("span", { children: H3 }, l)
        ) }) : b2(e, n)
      ]
    }
  );
}
function Dt3(t2, e) {
  let n, r2;
  function h(f) {
    n = f.clientX, t2.style.opacity = 1, document.body.style.cursor = "ew-resize", document.body.style.userSelect = "none", window.addEventListener("mousemove", p), window.addEventListener("mouseup", c), e && e.down && e.down(t2);
  }
  function p(f) {
    r2 = f.clientX - n, e && e.move && e.move(r2);
  }
  function c() {
    t2.style.opacity = "", document.body.style.cursor = "", document.body.style.userSelect = "", e && e.up && e.up(r2), window.removeEventListener("mousemove", p), window.removeEventListener("mouseup", c);
  }
  return t2.addEventListener("mousedown", h), {
    destroy() {
      t2.removeEventListener("mousedown", h);
    }
  };
}
function _n2({ filter: t2, column: e, action: n, filterValue: r2 }) {
  function h({ value: p }) {
    n({ value: p, key: e.id });
  }
  return /* @__PURE__ */ i2(
    ke,
    {
      ...t2.config ?? {},
      value: r2,
      onChange: h
    }
  );
}
function jn2({ filter: t2, column: e, action: n, filterValue: r2 }) {
  const h = ee3(ce4), p = useStore(h, "flatData"), c = b3(
    () => t2?.config?.options || e?.options || u(),
    [t2, e, p]
  ), f = b3(() => t2?.config?.template, [t2]);
  function u() {
    const s = [];
    return p.forEach((v) => {
      const R4 = y2(v, e);
      s.includes(R4) || s.push(R4);
    }), s.map((v) => ({ id: v, label: v }));
  }
  function a3({ value: s }) {
    n({ value: s, key: e.id });
  }
  function m(s) {
    s.key !== "Tab" && s.preventDefault();
  }
  return /* @__PURE__ */ i2("div", { style: { width: "100%" }, onKeyDown: m, children: /* @__PURE__ */ i2(
    an,
    {
      placeholder: "",
      clear: true,
      ...t2?.config ?? {},
      options: c,
      value: r2,
      onChange: a3,
      children: (s) => f ? f(s) : s.label
    }
  ) });
}
function Yn2({ filter: t2, column: e, action: n, filterValue: r2 }) {
  function h({ value: p }) {
    n({ value: p, key: e.id });
  }
  return /* @__PURE__ */ i2("div", { className: "wx-aaaK5VYO", style: { width: "100%" }, children: /* @__PURE__ */ i2(
    tn,
    {
      placeholder: "",
      clear: true,
      ...t2?.config ?? {},
      value: r2,
      onChange: h
    }
  ) });
}
function zt3(t2) {
  const {
    value: e,
    options: n = [],
    placeholder: r2 = "",
    clear: h = false,
    text: p = null,
    template: c = null,
    cell: f = null,
    dropdown: u = {},
    autoOpen: a3 = false,
    onChange: m,
    onAction: s
  } = t2, [v, R4] = useWritableProp2(e || []), S4 = b3(
    () => (v || []).map((T4) => n.find((G3) => G3.id === T4)).filter(Boolean),
    [v, n]
  ), d = I4(null), g = I4(null), [y4, C4] = _2(null), x3 = () => {
    const T4 = v || [];
    if (!T4.length) return 0;
    const G3 = n.find((j4) => T4.includes(j4.id));
    return G3 ? n.indexOf(G3) : 0;
  };
  function E4(T4) {
    g.current = T4.navigate, C4(() => T4.keydown), a3 && T4.navigate(x3());
  }
  O4(() => {
    a3 && (d.current?.focus(), typeof window < "u" && window.getSelection && window.getSelection().removeAllRanges());
  }, []);
  function D4({ id: T4 }) {
    R4(T4), m && m({ value: T4 });
  }
  function H3(T4) {
    T4.stopPropagation(), R4([]), m && m({ value: [] });
  }
  function l() {
    g.current?.(x3());
  }
  function A6() {
    g.current?.(null);
  }
  function F5(T4) {
    y4?.(T4, x3());
  }
  return /* @__PURE__ */ ne5(
    "div",
    {
      ref: d,
      className: "wx-multiselect wx-aadNNOwy",
      onClick: l,
      onKeyDown: F5,
      tabIndex: 0,
      children: [
        /* @__PURE__ */ i2("div", { className: "wx-label wx-aadNNOwy", children: c ? c(S4) : f ? /* @__PURE__ */ i2(f, { data: S4, onAction: s }) : p ? /* @__PURE__ */ i2("span", { className: "wx-text wx-aadNNOwy", children: p }) : S4.length ? /* @__PURE__ */ i2("span", { className: "wx-text wx-aadNNOwy", children: S4.map((T4) => T4.label).join(", ") }) : r2 ? /* @__PURE__ */ i2("span", { className: "wx-placeholder wx-aadNNOwy", children: r2 }) : " " }),
        h && v?.length ? /* @__PURE__ */ i2(
          "i",
          {
            className: "wx-icon wxi-close wx-aadNNOwy",
            onClick: H3
          }
        ) : /* @__PURE__ */ i2("i", { className: "wx-icon wxi-angle-down wx-aadNNOwy" }),
        /* @__PURE__ */ i2(
          Ne,
          {
            items: n,
            onReady: E4,
            onSelect: D4,
            multiselect: true,
            checkboxes: true,
            value: v || [],
            onCancel: A6,
            ...u,
            children: ({ option: T4 }) => /* @__PURE__ */ i2("div", { className: "wx-option wx-aadNNOwy", children: c ? c(T4) : f ? /* @__PURE__ */ i2(f, { data: T4, onAction: s }) : T4.label })
          }
        )
      ]
    }
  );
}
function Gn2({
  filter: t2,
  column: e,
  action: n,
  filterValue: r2
}) {
  const p = ee3(Qt.i18n)?.getGroup("grid") || locale(en_default3).getGroup("grid"), c = b3(() => ({ clear: true, ...t2?.config || {} }), [t2]), f = b3(
    () => c.options || e.options,
    [c, e]
  ), u = b3(() => {
    const s = r2?.length;
    return s ? s < 3 ? r2.map((v) => e.optionsMap.get(v)).join(", ") : s + " " + p("selected") : "";
  }, [r2, e, p]);
  function a3({ value: s }) {
    n({ value: s, key: e.id });
  }
  function m(s) {
    s.key !== "Tab" && s.preventDefault();
  }
  return /* @__PURE__ */ i2("div", { style: { width: "100%" }, onKeyDown: m, children: /* @__PURE__ */ i2(
    zt3,
    {
      placeholder: "",
      ...c,
      options: f,
      value: r2 || [],
      text: u,
      onChange: a3
    }
  ) });
}
var Xn2 = {
  text: _n2,
  richselect: jn2,
  datepicker: Yn2,
  multiselect: Gn2
};
function Bn2({ filter: t2, column: e }) {
  const n = ee3(ce4), r2 = useStore(n, "filterValues");
  function h(c) {
    n.exec("filter-rows", c);
  }
  const p = b3(() => Xn2[t2.type], [t2.type]);
  return /* @__PURE__ */ i2(
    p,
    {
      filter: t2,
      column: e,
      action: h,
      filterValue: r2[e.id]
    }
  );
}
function qn2(t2) {
  const {
    cell: e,
    column: n,
    row: r2,
    lastRow: h,
    sortRow: p,
    columnStyle: c,
    bodyHeight: f,
    hasSplit: u,
    deltaLeft: a3,
    leftColumnsWidth: m,
    rightColumnsWidth: s,
    viewportWidth: v
  } = t2, R4 = ee3(ce4), S4 = useStore(R4, "sortMarks"), d = useStore(R4, "scrollLeft"), g = b3(() => S4 ? S4[n.id] : void 0, [S4, n.id]), y4 = I4(), C4 = W4(
    (k2) => {
      y4.current = e.flexgrow ? k2.parentNode.clientWidth : e.width;
    },
    [e.flexgrow, e.width]
  ), x3 = W4(
    (k2, M2) => {
      R4.exec("resize-column", {
        id: e.id,
        width: Math.max(1, (y4.current || 0) + k2),
        inProgress: M2
      });
    },
    [R4, e.id]
  ), E4 = W4((k2) => x3(k2, true), [x3]), D4 = W4((k2) => x3(k2, false), [x3]), H3 = W4(
    (k2) => {
      if (!n.sort || e.filter) return;
      let M2 = g?.order;
      M2 && (M2 = M2 === "asc" ? "desc" : "asc"), R4.exec("sort-rows", { key: e.id, add: k2.ctrlKey || k2.metaKey, order: M2 });
    },
    [R4, e.id, e.filter, n.sort, g?.order]
  ), l = W4(
    (k2) => {
      k2 && k2.stopPropagation(), R4.exec("collapse-column", { id: e.id, row: r2 });
    },
    [R4, e.id, r2]
  ), A6 = W4(
    (k2) => {
      k2.key === "Enter" && l();
    },
    [l]
  ), F5 = W4(
    (k2) => {
      k2.key === "Enter" && !e.filter && H3(k2);
    },
    [H3, e.filter]
  ), T4 = b3(
    () => e.collapsed && n?.collapsed,
    [e.collapsed, n?.collapsed]
  ), G3 = b3(
    () => u && (n?.fixed === 0 || !n?.fixed),
    [u, n?.fixed]
  ), j4 = b3(() => {
    if (!u || !G3) return { visible: false, clip: {} };
    const k2 = e.width || n.width, M2 = a3 + e.left - d, be5 = v - s;
    if (M2 + k2 <= m || M2 >= be5)
      return { visible: false, clip: {} };
    const ge4 = Math.max(0, m - M2), ie6 = Math.max(0, M2 + k2 - be5);
    return {
      visible: true,
      clip: ge4 || ie6 ? { clipPath: `inset(0px ${ie6}px 0px ${ge4}px)` } : {}
    };
  }, [
    u,
    G3,
    e.width,
    n.width,
    e.left,
    a3,
    d,
    v,
    s,
    m
  ]), V7 = b3(
    () => !u || !G3 || j4.visible,
    [u, G3, j4.visible]
  ), Q5 = b3(
    () => u && G3 && j4.visible ? j4.clip : {},
    [u, G3, j4]
  ), se5 = b3(
    () => V7 ? { top: -f / 2, position: "absolute" } : {},
    [V7, f]
  ), oe3 = b3(
    () => ({
      ...Qe2(
        e.width,
        e.flexgrow,
        n.fixed,
        n.left,
        e.right ?? n.right,
        e.height + (T4 && V7 ? f : 0)
      ),
      ...Q5
    }),
    [
      e.width,
      e.flexgrow,
      n.fixed,
      n.left,
      e.right,
      n.right,
      e.height,
      T4,
      V7,
      f,
      Q5
    ]
  ), U5 = b3(
    () => Ot2(n, e, c),
    [n, e, c]
  ), Ie5 = W4(() => Object.fromEntries(
    Object.entries(e).filter(([k2]) => k2 !== "cell")
  ), [e]), ve3 = `wx-cell ${U5} ${e.css || ""} wx-collapsed`, Ee4 = [
    "wx-cell",
    U5,
    e.css || "",
    e.filter ? "wx-filter" : "",
    n.fixed && n.fixed.right ? "wx-fixed-right" : ""
  ].filter(Boolean).join(" "), Z3 = I4(null);
  return O4(() => {
    const k2 = Z3.current;
    if (!k2) return;
    const M2 = Dt3(k2, { down: C4, move: E4, up: D4 });
    return () => {
      typeof M2 == "function" && M2();
    };
  }, [C4, E4, D4, Dt3]), T4 ? V7 ? /* @__PURE__ */ i2(
    "div",
    {
      className: "wx-RsQD74qC " + ve3,
      style: oe3,
      role: "button",
      "aria-label": `Expand column ${e.text || ""}`,
      "aria-expanded": !e.collapsed,
      tabIndex: 0,
      onKeyDown: A6,
      onClick: l,
      "data-header-id": setID(n.id),
      children: /* @__PURE__ */ i2("div", { className: "wx-RsQD74qC wx-text", style: se5, children: e.text || "" })
    }
  ) : /* @__PURE__ */ i2(
    "div",
    {
      className: "wx-RsQD74qC " + ve3,
      style: oe3,
      "aria-hidden": "true",
      "data-header-id": setID(n.id)
    }
  ) : /* @__PURE__ */ ne5(
    "div",
    {
      className: "wx-RsQD74qC " + Ee4,
      style: oe3,
      onClick: H3,
      "data-header-id": setID(n.id),
      tabIndex: !e._hidden && n.sort && !e.filter ? 0 : void 0,
      role: "columnheader",
      "aria-colindex": n._colindex,
      "aria-colspan": e.colspan > 1 ? e.colspan : void 0,
      "aria-rowspan": e.rowspan > 1 ? e.rowspan : void 0,
      "aria-sort": !g?.order || e.filter ? "none" : g?.order === "asc" ? "ascending" : "descending",
      onKeyDown: F5,
      children: [
        e.collapsible ? /* @__PURE__ */ i2(
          "div",
          {
            className: "wx-RsQD74qC wx-collapse",
            role: "button",
            "aria-label": e.collapsed ? "Expand column" : "Collapse column",
            "aria-expanded": !e.collapsed,
            tabIndex: 0,
            onKeyDown: A6,
            onClick: l,
            children: /* @__PURE__ */ i2(
              "i",
              {
                className: `wx-RsQD74qC wxi-angle-${e.collapsed ? "down" : "right"}`
              }
            )
          }
        ) : null,
        e.cell ? (() => {
          const k2 = e.cell;
          return /* @__PURE__ */ i2(
            k2,
            {
              api: R4,
              cell: Ie5(),
              column: n,
              row: r2,
              onAction: ({ action: M2, data: be5 }) => R4.exec(M2, be5)
            }
          );
        })() : e.filter ? /* @__PURE__ */ i2(Bn2, { filter: e.filter, column: n }) : /* @__PURE__ */ i2("div", { className: "wx-RsQD74qC wx-text", children: e.text || "" }),
        n.resize && h && !e._hidden ? /* @__PURE__ */ i2(
          "div",
          {
            className: "wx-RsQD74qC wx-grip",
            role: "presentation",
            "aria-label": "Resize column",
            ref: Z3,
            onClick: (k2) => k2.stopPropagation(),
            children: /* @__PURE__ */ i2("div", {})
          }
        ) : null,
        p ? /* @__PURE__ */ i2("div", { className: "wx-RsQD74qC wx-sort", children: g ? /* @__PURE__ */ ne5(Re4, { children: [
          typeof g.index < "u" ? /* @__PURE__ */ i2("div", { className: "wx-RsQD74qC wx-order", children: g.index + 1 }) : null,
          /* @__PURE__ */ i2(
            "i",
            {
              className: `wx-RsQD74qC wxi-arrow-${g.order === "asc" ? "up" : "down"}`
            }
          )
        ] }) : null }) : null
      ]
    }
  );
}
function Un2({ cell: t2, column: e, row: n, columnStyle: r2 }) {
  const h = ee3(ce4), p = b3(
    () => Qe2(
      t2?.width,
      t2?.flexgrow,
      e?.fixed,
      e?.left,
      t2?.right ?? e?.right,
      t2?.height
    ),
    [
      t2?.width,
      t2?.flexgrow,
      e?.fixed,
      e?.left,
      t2?.right,
      e?.right,
      t2?.height
    ]
  ), c = b3(
    () => Ot2(e, t2, r2),
    [e, t2, r2]
  ), f = W4(() => Object.fromEntries(
    Object.entries(t2 || {}).filter(([a3]) => a3 !== "cell")
  ), [t2]), u = `wx-6Sdi3Dfd wx-cell ${c || ""} ${t2?.css || ""}` + (e?.fixed && e?.fixed.right ? " wx-fixed-right" : "");
  return /* @__PURE__ */ i2("div", { className: u, style: p, children: !e?.collapsed && !t2?.collapsed ? t2?.cell ? tn3.createElement(t2.cell, {
    api: h,
    cell: f(),
    column: e,
    row: n,
    onAction: ({ action: a3, data: m }) => h.exec(a3, m)
  }) : /* @__PURE__ */ i2("div", { className: "wx-6Sdi3Dfd wx-text", children: t2?.text || "" }) : null });
}
function Ht2({
  deltaLeft: t2,
  contentWidth: e,
  columns: n,
  type: r2 = "header",
  columnStyle: h,
  bodyHeight: p,
  ...c
}) {
  const f = ee3(ce4), u = useStore(f, "_sizes"), a3 = useStore(f, "split"), m = b3(() => u?.[`${r2}RowHeights`], [u, r2]), s = b3(() => {
    let g = [];
    if (n && n.length) {
      const y4 = n[0][r2].length;
      for (let C4 = 0; C4 < y4; C4++) {
        let x3 = 0, E4 = 0;
        g.push([]), n.forEach((D4, H3) => {
          const l = { ...D4[r2][C4] };
          if (x3 || (l.left = E4, g[C4].push(l)), E4 += D4.width, l.colspan > 1) {
            if (x3 = l.colspan - 1, !fe3() && D4.right) {
              let A6 = D4.right;
              for (let F5 = 1; F5 < l.colspan; F5++)
                A6 -= n[H3 + F5].width;
              l.right = A6;
            }
          } else x3 && x3--;
        });
      }
    }
    return g;
  }, [n, r2]), v = b3(() => a3?.left || a3?.right, [a3]);
  function R4(g) {
    return n.find((y4) => y4.id === g);
  }
  function S4(g, y4) {
    let C4 = y4;
    return g.rowspan && (C4 += g.rowspan - 1), C4 === s.length - 1;
  }
  function d(g, y4, C4) {
    if (!C4.sort) return false;
    for (let x3 = s.length - 1; x3 >= 0; x3--) {
      const E4 = C4.header[x3];
      if (!E4.filter && !E4._hidden) return y4 === x3;
    }
    return S4(g, y4);
  }
  return /* @__PURE__ */ i2(
    "div",
    {
      className: `wx-sAsPVaUK wx-${r2}`,
      style: { paddingLeft: `${t2}px`, width: `${e}px` },
      role: "rowgroup",
      children: s.map((g, y4) => /* @__PURE__ */ i2(
        "div",
        {
          className: r2 === "header" ? "wx-sAsPVaUK wx-h-row" : "wx-sAsPVaUK wx-f-row",
          style: { height: `${m?.[y4]}px`, display: "flex" },
          role: "row",
          children: g.map((C4) => {
            const x3 = R4(C4.id);
            return r2 === "header" ? /* @__PURE__ */ i2(
              qn2,
              {
                cell: C4,
                columnStyle: h,
                column: x3,
                row: y4,
                lastRow: S4(C4, y4),
                bodyHeight: p,
                sortRow: d(C4, y4, x3),
                hasSplit: v,
                deltaLeft: t2,
                ...c
              },
              C4.id
            ) : /* @__PURE__ */ i2(
              Un2,
              {
                cell: C4,
                columnStyle: h,
                column: x3,
                row: y4
              },
              C4.id
            );
          })
        },
        y4
      ))
    }
  );
}
function Qn2({ overlay: t2 }) {
  const e = ee3(ce4);
  function n(h) {
    return typeof h == "function";
  }
  const r2 = t2;
  return /* @__PURE__ */ i2("div", { className: "wx-1ty666CQ wx-overlay", children: n(t2) ? /* @__PURE__ */ i2(r2, { onAction: ({ action: h, data: p }) => e.exec(h, p) }) : t2 });
}
function Zn2(t2) {
  const { editor: e, onSave: n, onApply: r2 } = t2, [h, p] = _2(e?.value || ""), { type: c = "text" } = b3(() => e?.config || {}, [e]), f = I4(null);
  O4(() => {
    f.current && f.current.focus();
  }, []), O4(() => {
    if (!f.current) return;
    const m = clickOutside(f.current, () => n(true));
    return () => m.destroy();
  }, [n]);
  function u() {
    f.current && (p(f.current.value), r2(f.current.value));
  }
  function a3({ key: m }) {
    m === "Enter" && n();
  }
  return /* @__PURE__ */ i2(
    "input",
    {
      className: "wx-e7Ao5ejY wx-text",
      onInput: u,
      onKeyDown: a3,
      ref: f,
      type: c,
      value: h
    }
  );
}
function Jn2({ editor: t2, onAction: e, onSave: n, onApply: r2, onCancel: h }) {
  const [p, c] = _2(t2?.value), [f, u] = _2(t2?.renderedValue), [a3, m] = _2(t2?.options || []), s = b3(() => t2?.config?.template, [t2]), v = b3(() => t2?.config?.cell, [t2]), R4 = b3(() => t2?.config?.dropdown || {}, [t2]), S4 = b3(() => ({ trackScroll: true, ...R4 }), [R4]), d = b3(() => (a3 || []).findIndex((l) => l.id === p), [a3, p]), g = I4(null), y4 = I4(null), C4 = W4(
    (l) => {
      g.current = l.navigate, y4.current = l.keydown, g.current(d);
    },
    [d, g]
  ), x3 = W4(
    (l) => {
      const A6 = l?.target?.value ?? "";
      u(A6);
      const F5 = A6 ? (t2?.options || []).filter(
        (T4) => (T4.label || "").toLowerCase().includes(A6.toLowerCase())
      ) : t2?.options || [];
      m(F5), F5.length ? g.current(-1 / 0) : g.current(null);
    },
    [t2]
  ), E4 = I4(null);
  O4(() => {
    E4.current && E4.current.focus();
  }, []);
  const D4 = I4(n);
  O4(() => {
    D4.current = n;
  }, [n]), O4(() => {
    if (!E4.current) return;
    const l = clickOutside(E4.current, () => D4.current(true));
    return () => l.destroy();
  }, []), O4(() => {
    c(t2?.value), u(t2?.renderedValue), m(t2?.options || []);
  }, [t2]);
  const H3 = W4(
    ({ id: l }) => {
      r2(l), n();
    },
    [r2, n]
  );
  return /* @__PURE__ */ ne5(Re4, { children: [
    /* @__PURE__ */ i2(
      "input",
      {
        className: "wx-0UYfSd1x wx-input",
        ref: E4,
        value: f ?? "",
        onChange: x3,
        onKeyDown: (l) => y4.current ? y4.current(l, d) : void 0
      }
    ),
    /* @__PURE__ */ i2(
      Ne,
      {
        items: a3,
        onReady: C4,
        onSelect: H3,
        ...S4,
        onCancel: h,
        children: ({ option: l }) => s ? s(l) : v ? /* @__PURE__ */ i2(v, { data: l, onAction: e }) : l.label
      }
    )
  ] });
}
function eo({ editor: t2, onAction: e, onSave: n, onApply: r2, onCancel: h }) {
  const [p] = _2(() => t2.value || /* @__PURE__ */ new Date()), { template: c, cell: f, dropdown: u = {} } = t2?.config || {}, a3 = b3(() => ({
    trackScroll: true,
    width: "auto",
    ...u
  }), [u]);
  function m({ value: S4 }) {
    r2(S4), n();
  }
  const s = I4(null), [v, R4] = _2(null);
  return O4(() => {
    s.current && s.current.focus(), typeof window < "u" && window.getSelection && window.getSelection().removeAllRanges();
  }, []), O4(() => {
    if (!v) return;
    const S4 = clickOutside(v, () => n(true));
    return () => S4.destroy();
  }, [v, n]), /* @__PURE__ */ ne5(Re4, { children: [
    /* @__PURE__ */ i2(
      "div",
      {
        className: "wx-lNWNYUb6 wx-value",
        ref: s,
        tabIndex: 0,
        onClick: h,
        onKeyDown: (S4) => S4.preventDefault(),
        children: c ? c(p) : f ? /* @__PURE__ */ i2(f, { data: t2.value, onAction: e }) : /* @__PURE__ */ i2("span", { className: "wx-lNWNYUb6 wx-text", children: t2.renderedValue })
      }
    ),
    /* @__PURE__ */ i2(se, { ...a3, onCancel: h, children: /* @__PURE__ */ i2("div", { ref: R4, className: "wx-lNWNYUb6", children: /* @__PURE__ */ i2(
      Tt,
      {
        value: p,
        onChange: m,
        buttons: t2.config?.buttons
      }
    ) }) })
  ] });
}
function to(t2) {
  const { editor: e } = t2, n = t2.onAction ?? t2.onaction, r2 = t2.onSave ?? t2.onsave, h = t2.onApply ?? t2.onapply, p = t2.onCancel ?? t2.oncancel, c = e.config || {}, { dropdown: f = {} } = c, u = b3(
    () => ({ trackScroll: true, ...f }),
    [f]
  ), [a3] = _2(
    e.options.find((x3) => x3.id === e.value)
  ), [m] = _2(e.value), [s] = _2(e.options), v = b3(
    () => s.findIndex((x3) => x3.id === m),
    [s, m]
  );
  function R4({ id: x3 }) {
    h(x3), r2();
  }
  let S4;
  const [d, g] = _2();
  function y4(x3) {
    S4 = x3.navigate, g(() => x3.keydown), S4(v);
  }
  const C4 = I4(null);
  return O4(() => {
    C4.current && C4.current.focus(), typeof window < "u" && window.getSelection && window.getSelection().removeAllRanges();
  }, []), O4(() => {
    if (!C4.current) return;
    const x3 = clickOutside(C4.current, () => r2(true));
    return () => x3.destroy();
  }, [r2]), /* @__PURE__ */ ne5(Re4, { children: [
    /* @__PURE__ */ i2(
      "div",
      {
        ref: C4,
        className: "wx-ywGRk611 wx-value",
        tabIndex: 0,
        onClick: p,
        onKeyDown: (x3) => {
          d(x3, v), x3.preventDefault();
        },
        children: c.template ? c.template(a3) : c.cell ? (() => {
          const x3 = c.cell;
          return /* @__PURE__ */ i2(x3, { data: a3, onAction: n });
        })() : /* @__PURE__ */ i2("span", { className: "wx-ywGRk611 wx-text", children: e.renderedValue })
      }
    ),
    /* @__PURE__ */ i2(Ne, { items: s, onReady: y4, onSelect: R4, ...u, onCancel: p, children: ({ option: x3 }) => c.template ? c.template(x3) : c.cell ? (() => {
      const E4 = c.cell;
      return /* @__PURE__ */ i2(E4, { data: x3, onAction: n });
    })() : x3.label })
  ] });
}
function no(t2) {
  const { editor: e, onAction: n, onSave: r2, onApply: h } = t2, p = e?.config || {}, c = e?.options ?? [], f = e?.value || [], u = e?.renderedValue, a3 = b3(
    () => ({
      trackScroll: true,
      ...p.dropdown || {}
    }),
    [p]
  );
  function m({ value: v }) {
    h(v);
  }
  const s = I4(null);
  return O4(() => {
    if (!s.current) return;
    const v = clickOutside(s.current, () => r2(true));
    return () => v.destroy();
  }, [r2]), /* @__PURE__ */ i2(
    "div",
    {
      ref: s,
      className: "wx-value wx-aacZ4gNU",
      onClick: () => r2(true),
      children: /* @__PURE__ */ i2(
        zt3,
        {
          value: f,
          options: c,
          text: u,
          template: p.template,
          cell: p.cell,
          clear: p.clear,
          dropdown: a3,
          autoOpen: true,
          onChange: m,
          onAction: n
        }
      )
    }
  );
}
var Vt3 = {
  text: Zn2,
  combo: Jn2,
  datepicker: eo,
  richselect: to,
  multiselect: no
};
function oo({ column: t2, row: e }) {
  const n = ee3(ce4), r2 = useStore(n, "editor"), h = W4(
    (S4, d) => {
      n.exec("close-editor", { ignore: S4 }), d && n.exec("focus-cell", {
        ...d,
        eventSource: "click"
      });
    },
    [n]
  ), p = W4(
    (S4) => {
      const d = S4 ? null : { row: r2?.id, column: r2?.column };
      h(false, d);
    },
    [r2, h]
  ), c = W4(() => {
    h(true, { row: r2?.id, column: r2?.column });
  }, [r2, h]), f = W4(
    (S4) => {
      n.exec("editor", { value: S4 });
    },
    [n]
  ), u = W4(
    (S4) => {
      S4.key === "Enter" && r2 && (t2.editor.type === "multiselect" ? f(r2.value) : c());
    },
    [r2, t2.editor, c, f]
  ), a3 = b3(
    () => Qe2(
      t2.width,
      t2.flexgrow,
      t2.fixed,
      t2.left,
      t2.right
    ),
    [t2.width, t2.flexgrow, t2.fixed, t2.left, t2.right]
  ), m = b3(() => {
    let S4 = t2.editor;
    if (typeof S4 == "function" && (S4 = S4(e, t2)), !S4) return null;
    let d = typeof S4 == "string" ? S4 : S4.type;
    return Vt3[d];
  }, [t2, e]), s = I4(null);
  O4(() => {
    s.current && typeof a3 == "string" && s.current.setAttribute("style", a3);
  }, [a3]);
  const v = typeof e.$parent < "u" ? "gridcell" : "cell", R4 = typeof e.$parent < "u" ? !t2.editor : void 0;
  return /* @__PURE__ */ i2(
    "div",
    {
      className: "wx-8l724t2g wx-cell wx-editor",
      ref: s,
      style: typeof a3 == "object" && a3 !== null ? a3 : void 0,
      role: v,
      "aria-readonly": R4,
      tabIndex: -1,
      onClick: (S4) => S4.stopPropagation(),
      onDoubleClick: (S4) => S4.stopPropagation(),
      onKeyDown: u,
      children: m ? /* @__PURE__ */ i2(
        m,
        {
          editor: r2,
          onSave: p,
          onApply: f,
          onCancel: c,
          onAction: ({ action: S4, data: d }) => n.exec(S4, d)
        }
      ) : null
    }
  );
}
function kt3(t2) {
  const { columns: e, type: n, columnStyle: r2 } = t2, h = ee3(ce4), { filterValues: p, _columns: c, _sizes: f } = h.getState();
  function u(a3) {
    return r2 ? " " + r2(a3) : "";
  }
  return /* @__PURE__ */ i2(Re4, { children: e.map((a3, m) => /* @__PURE__ */ i2("tr", { children: a3.map((s) => {
    const v = c.find((d) => d.id === s.id), R4 = `wx-print-cell-${n}${u(v)}${s.filter ? " wx-print-cell-filter" : ""}${s.vertical ? " wx-vertical" : ""}`, S4 = s.cell;
    return /* @__PURE__ */ i2(
      "th",
      {
        style: styleObject(ne3(s, f.columnWidth)),
        className: "wx-Gy81xq2u " + R4,
        rowSpan: s.rowspan,
        colSpan: s.colspan,
        children: S4 ? /* @__PURE__ */ i2(
          S4,
          {
            api: h,
            cell: Object.fromEntries(
              Object.entries(s).filter(([d]) => d !== "cell")
            ),
            column: v,
            row: m
          }
        ) : s.filter ? /* @__PURE__ */ i2("div", { className: "wx-Gy81xq2u wx-print-filter", children: ae2(p, c, s) }) : /* @__PURE__ */ i2("div", { className: "wx-Gy81xq2u wx-text", children: s.text ?? "" })
      },
      s.id
    );
  }) }, m)) });
}
function ro(t2) {
  const { columns: e, rowStyle: n, columnStyle: r2, cellStyle: h, header: p, footer: c, reorder: f } = t2, u = ee3(ce4), { flatData: a3, _sizes: m } = u.getState(), s = p && oe2(e, "header", m.headerRowHeights), v = c && oe2(e, "footer", m.footerRowHeights);
  function R4(d, g) {
    let y4 = "";
    return y4 += r2 ? " " + r2(g) : "", y4 += h ? " " + h(d, g) : "", y4;
  }
  function S4(d, g) {
    return typeof g.draggable == "function" ? g.draggable(d, g) !== false : g.draggable;
  }
  return /* @__PURE__ */ ne5(
    "table",
    {
      className: `wx-8NTMLH0z wx-print-grid ${e.some((d) => d.flexgrow) ? "wx-flex-columns" : ""}`,
      children: [
        p ? /* @__PURE__ */ i2("thead", { children: /* @__PURE__ */ i2(
          kt3,
          {
            columns: s,
            type: "header",
            columnStyle: r2
          }
        ) }) : null,
        /* @__PURE__ */ i2("tbody", { children: a3.map((d, g) => /* @__PURE__ */ i2(
          "tr",
          {
            className: "wx-8NTMLH0z wx-row" + (n ? " " + n(d) : ""),
            style: { height: `${d.rowHeight || m.rowHeight}px` },
            children: e.map(
              (y4) => y4.collapsed ? null : /* @__PURE__ */ ne5(
                "td",
                {
                  className: `wx-8NTMLH0z wx-print-cell wx-cell ${R4(d, y4)}`,
                  style: styleObject(
                    ne3(y4, m.columnWidth)
                  ),
                  children: [
                    f && y4.draggable ? /* @__PURE__ */ i2("span", { className: "wx-8NTMLH0z wx-print-draggable", children: S4(d, y4) ? /* @__PURE__ */ i2("i", { className: "wx-8NTMLH0z wxi-drag" }) : null }) : null,
                    y4.treetoggle ? /* @__PURE__ */ ne5(Re4, { children: [
                      /* @__PURE__ */ i2(
                        "span",
                        {
                          style: { marginLeft: d.$level * 28 + "px" }
                        }
                      ),
                      d.$count ? /* @__PURE__ */ i2(
                        "i",
                        {
                          className: `wx-8NTMLH0z wx-print-grid-tree-toggle wxi-menu-${d.open !== false ? "down" : "right"}`
                        }
                      ) : null
                    ] }) : null,
                    y4.cell ? (() => {
                      const C4 = y4.cell;
                      return /* @__PURE__ */ i2(C4, { api: u, row: d, column: y4 });
                    })() : /* @__PURE__ */ i2("span", { children: b2(d, y4) })
                  ]
                },
                y4.id
              )
            )
          },
          g
        )) }),
        c ? /* @__PURE__ */ i2("tfoot", { children: /* @__PURE__ */ i2(
          kt3,
          {
            columns: v,
            type: "footer",
            columnStyle: r2
          }
        ) }) : null
      ]
    }
  );
}
function lo(t2) {
  const { config: e, ...n } = t2, r2 = ee3(ce4), { _skin: h, _columns: p } = r2.getState(), c = b3(() => te3(p, e), []), f = I4(null);
  return O4(() => {
    const u = document.body;
    u.classList.add("wx-print");
    const a3 = f.current;
    if (!a3) return;
    const m = a3.cloneNode(true);
    u.appendChild(m);
    const s = `@media print { @page { size: ${e.paper} ${e.mode}; }`, v = document.createElement("style");
    v.setAttribute("type", "text/css"), v.setAttribute("media", "print"), document.getElementsByTagName("head")[0].appendChild(v), v.appendChild(document.createTextNode(s)), window.print(), v.remove(), u.classList.remove("wx-print"), m.remove();
  }, []), /* @__PURE__ */ i2(
    "div",
    {
      className: `wx-4zwCKA7C wx-${h}-theme wx-print-container`,
      ref: f,
      children: c.map((u, a3) => /* @__PURE__ */ i2("div", { className: "wx-4zwCKA7C wx-print-grid-wrapper", children: /* @__PURE__ */ i2(ro, { columns: u, ...n }) }, a3))
    }
  );
}
function so(t2) {
  const {
    header: e,
    footer: n,
    overlay: r2,
    multiselect: h,
    onreorder: p,
    rowStyle: c,
    columnStyle: f,
    cellStyle: u,
    autoRowHeight: a3,
    resize: m,
    clientWidth: s,
    clientHeight: v,
    responsiveLevel: R4,
    hotkeys: S4
  } = t2, d = ee3(ce4), g = useStore(d, "dynamic"), y4 = useStore(d, "_columns"), C4 = useStore(d, "flatData"), x3 = useStore(d, "split"), E4 = useStore(d, "_sizes"), [D4, H3] = useStoreWithCounter(d, "selectedRows"), l = useStore(d, "select"), A6 = useStore(d, "editor"), F5 = useStore(d, "scrollLeft"), T4 = useStore(d, "scrollTop"), G3 = useStore(d, "tree"), j4 = useStore(d, "focusCell"), V7 = useStore(d, "_print"), Q5 = useStore(d, "undo"), se5 = useStore(d, "reorder"), oe3 = useStore(d, "_rowHeightFromData"), [U5, Ie5] = _2(0);
  O4(() => {
    Ie5(qt2());
  }, []);
  const [ve3, Ee4] = _2(0), Z3 = b3(() => (y4 || []).some((o) => !o.hidden && o.flexgrow), [y4]), k2 = b3(() => E4?.rowHeight || 0, [E4]), M2 = I4(null), [be5, ge4] = _2(null), [ie6, Ke3] = _2(null), re3 = b3(() => {
    let o = [], w = 0;
    return x3 && x3.left && (o = (y4 || []).slice(0, x3.left).filter((N3) => !N3.hidden).map((N3) => ({ ...N3 })), o.forEach((N3) => {
      N3.fixed = { left: 1, leftSize: x3.left }, N3.left = w, w += N3.width;
    }), o.length && (o[o.length - 1].fixed.left = -1)), { columns: o, width: w };
  }, [x3, y4]), ae4 = b3(() => {
    let o = [], w = 0;
    if (x3 && x3.right) {
      o = (y4 || []).slice(x3.right * -1).filter((N3) => !N3.hidden).map((N3) => ({ ...N3 }));
      for (let N3 = o.length - 1; N3 >= 0; N3--) {
        const $2 = o[N3];
        $2.fixed = { right: 1 }, $2.right = w, w += $2.width;
      }
      o.length && (o[0].fixed = { right: -1 });
    }
    return { columns: o, width: w };
  }, [x3, y4]), z4 = b3(() => {
    const o = (y4 || []).slice(x3?.left || 0, (y4 || []).length - (x3?.right ?? 0)).filter((w) => !w.hidden);
    return o.forEach((w) => {
      w.fixed = 0;
    }), o;
  }, [y4, x3]), X6 = b3(() => (y4 || []).reduce((o, w) => (w.hidden || (o += w.width), o), 0), [y4]), le4 = 1;
  function pe4(o, w, N3) {
    let $2 = w, B4 = o;
    if (z4.length) {
      let Y4 = z4.length;
      for (let L5 = o; L5 >= 0; L5--)
        z4[L5][N3].forEach((te4) => {
          te4.colspan > 1 && L5 > o - te4.colspan && L5 < Y4 && (Y4 = L5);
        });
      if (Y4 !== z4.length && Y4 < o) {
        for (let L5 = Y4; L5 < o; L5++)
          $2 -= z4[L5].width;
        B4 = Y4;
      }
    }
    return { index: B4, delta: $2 };
  }
  const J6 = b3(() => {
    let o, w, N3;
    const $2 = F5 || 0, B4 = (F5 || 0) + (s || 0);
    let Y4 = 0, L5 = 0, P4 = 0, te4 = 0;
    z4.forEach((me3, we3) => {
      $2 > P4 && (Y4 = we3, te4 = P4), P4 = P4 + me3.width, B4 > P4 && (L5 = we3 + le4);
    });
    const ue5 = { header: 0, footer: 0 };
    for (let me3 = L5; me3 >= Y4; me3--)
      ["header", "footer"].forEach((we3) => {
        z4[me3] && z4[me3][we3].forEach((en2) => {
          const ot3 = en2.colspan;
          if (ot3 && ot3 > 1) {
            const yt3 = ot3 - (L5 - me3 + 1);
            yt3 > 0 && (ue5[we3] = Math.max(ue5[we3], yt3));
          }
        });
      });
    const He3 = pe4(Y4, te4, "header"), q4 = pe4(Y4, te4, "footer"), xe5 = He3.delta, ze3 = He3.index, je3 = q4.delta, Ye = q4.index, Ve2 = Z3 && X6 > (s || 0);
    return Ve2 ? o = w = N3 = [...re3.columns, ...z4, ...ae4.columns] : (o = [
      ...re3.columns,
      ...z4.slice(Y4, L5 + 1),
      ...ae4.columns
    ], w = [
      ...re3.columns,
      ...z4.slice(ze3, L5 + ue5.header + 1),
      ...ae4.columns
    ], N3 = [
      ...re3.columns,
      ...z4.slice(Ye, L5 + ue5.footer + 1),
      ...ae4.columns
    ]), {
      data: o || [],
      header: w || [],
      footer: N3 || [],
      ...Ve2 ? { d: 0, df: 0, dh: 0 } : { d: te4, df: je3, dh: xe5 }
    };
  }, [
    z4,
    re3,
    ae4,
    F5,
    s,
    Z3,
    X6
  ]), Le4 = b3(
    () => e && E4?.headerHeight || 0,
    [e, E4]
  ), Ce4 = b3(
    () => n && (C4 || []).length && E4?.footerHeight || 0,
    [n, C4, E4]
  ), Se4 = b3(() => s && v ? X6 >= s : false, [s, v, X6]), [fe4, Kt2] = _2(false), Ne3 = b3(() => (v || 0) - Le4 - Ce4 - (Se4 ? U5 : 0), [v, Le4, Ce4, Se4, U5]), Pt4 = b3(() => Ce4 ? Math.min(ve3 + 1, Ne3 - +n) : Ne3, [Ce4, ve3, Ne3, n]), ct2 = b3(() => Math.ceil((Ne3 || 0) / (k2 || 1)) + 1, [Ne3, k2]), Ze3 = I4([]), [at3, Wt3] = _2(0), [dt3, Ft4] = _2(void 0), de5 = b3(() => {
    let o = 0, w = 0;
    const N3 = 2, $2 = T4 || 0;
    if (a3) {
      let L5 = $2;
      for (; L5 > 0; )
        L5 -= Ze3.current[o] || k2, o++;
      w = $2 - L5;
      for (let P4 = Math.max(0, o - N3 - 1); P4 < o; P4++)
        w -= Ze3.current[o - P4] || k2;
      o = Math.max(0, o - N3);
    } else {
      if (oe3) {
        let L5 = 0, P4 = 0;
        for (let q4 = 0; q4 < (C4 || []).length; q4++) {
          const xe5 = C4[q4].rowHeight || k2;
          if (P4 + xe5 > $2) {
            L5 = q4;
            break;
          }
          P4 += xe5;
        }
        o = Math.max(0, L5 - N3);
        for (let q4 = 0; q4 < o; q4++)
          w += C4[q4].rowHeight || k2;
        let te4 = 0, ue5 = 0;
        for (let q4 = L5 + 1; q4 < (C4 || []).length; q4++) {
          const xe5 = C4[q4].rowHeight || k2;
          if (te4++, ue5 + xe5 > Ne3)
            break;
          ue5 += xe5;
        }
        const He3 = Math.min(
          g ? g.rowCount : (C4 || []).length,
          L5 + te4 + N3
        );
        return { d: w, start: o, end: He3 };
      }
      o = Math.floor($2 / (k2 || 1)), o = Math.max(0, o - N3), w = o * (k2 || 0);
    }
    const B4 = g ? g.rowCount : (C4 || []).length, Y4 = Math.min(B4, o + (ct2 || 0) + N3);
    return { d: w, start: o, end: Y4 };
  }, [a3, oe3, T4, k2, g, C4, ct2, Ne3]), ut2 = b3(() => {
    const o = g ? g.rowCount : (C4 || []).length;
    if (a3)
      return at3 + de5.d + (o - (dt3 || 0)) * (k2 || 0);
    if (!oe3)
      return o * (k2 || 0);
    let w = 0;
    for (let N3 = 0; N3 < o; N3++)
      w += C4[N3]?.rowHeight || k2;
    return w;
  }, [
    g,
    C4,
    k2,
    a3,
    oe3,
    at3,
    de5.d,
    dt3
  ]), ft3 = I4({});
  ft3.current = {
    clientWidth: s,
    clientHeight: v,
    fullHeight: ut2,
    headerHeight: Le4,
    footerHeight: Ce4,
    fullWidth: X6,
    SCROLLSIZE: U5
  };
  const Pe3 = W4(() => {
    const o = ft3.current;
    Kt2(
      o.clientWidth && o.clientHeight ? o.fullHeight + o.headerHeight + o.footerHeight >= o.clientHeight - (o.fullWidth >= o.clientWidth ? o.SCROLLSIZE : 0) : false
    );
  }, []);
  O4(() => {
    const o = requestAnimationFrame(Pe3);
    return () => window.cancelAnimationFrame(o);
  }, [ve3, Pe3]), O4(() => {
    Pe3();
  }, [v, Pe3]);
  const De3 = b3(() => Z3 && X6 <= (s || 0) ? (s || 0) - 0 - (fe4 ? U5 : 0) : X6, [Z3, X6, s, fe4, U5, Se4]), Te3 = b3(() => Z3 && X6 <= (s || 0) ? s || 0 : De3 < (s || 0) ? X6 + (fe4 ? U5 : 0) : -1, [Z3, X6, s, De3, fe4, U5]), Je2 = I4({});
  O4(() => {
    if (g && (Je2.current.start !== de5.start || Je2.current.end !== de5.end)) {
      const { start: o, end: w } = de5;
      Je2.current = { start: o, end: w }, d && d.exec && d.exec("request-data", { row: { start: o, end: w } });
    }
  }, [g, de5, d]);
  const he5 = b3(() => g ? C4 || [] : (C4 || []).slice(de5.start, de5.end), [g, C4, de5]), Oe2 = b3(() => (D4 || []).filter(
    (o) => (he5 || []).some((w) => w.id === o)
  ), [H3, he5]), et3 = b3(() => de5.start, [de5.start]), ht3 = I4({ top: T4, left: F5 });
  ht3.current = { top: T4, left: F5 };
  const _t3 = W4((o) => {
    const w = o.target.scrollTop, N3 = o.target.scrollLeft, $2 = ht3.current;
    (w !== $2.top || N3 !== $2.left) && d.exec("scroll-to", { top: w, left: N3 });
  }, [d]), jt2 = W4((o) => {
    o.shiftKey && o.preventDefault(), M2.current && M2.current.focus && M2.current.focus();
  }, []), pt3 = W4(() => !!(y4 || []).find((o) => !!o.draggable), [y4]), tt3 = I4(null), $e2 = I4(null), nt2 = I4(D4);
  O4(() => {
    nt2.current = D4;
  }, [D4]);
  const Yt2 = I4({
    dblclick: (o, w) => {
      const N3 = { id: o, column: locateID(w, "data-col-id") };
      d.exec("open-editor", N3);
    },
    click: (o, w) => {
      if (w.target.closest("input") || tt3.current) return;
      const N3 = locateID(w, "data-col-id");
      if (j4?.id !== o && d.exec("focus-cell", {
        row: o,
        column: N3,
        eventSource: "click"
      }), l === false) return;
      const $2 = h && (w.ctrlKey || w.metaKey), B4 = h && w.shiftKey;
      ($2 || nt2.current.length > 1 || !nt2.current.includes(o)) && d.exec("select-row", { id: o, toggle: $2, range: B4 });
    },
    "toggle-row": (o) => {
      const w = d.getRow(o);
      d.exec(w.open !== false ? "close-row" : "open-row", { id: o });
    },
    "ignore-click": () => false
  }), We2 = b3(() => ({
    top: Le4,
    bottom: Ce4,
    left: re3.width,
    xScroll: Se4,
    yScroll: fe4,
    sense: a3 && ie6 ? ie6.offsetHeight : Math.max(E4?.rowHeight || 0, 40),
    node: M2.current && M2.current.firstElementChild
  }), [
    Le4,
    Ce4,
    re3.width,
    Se4,
    fe4,
    a3,
    ie6,
    E4
  ]);
  function Gt3(o, w) {
    const { container: N3, sourceNode: $2, from: B4 } = w;
    if (pt3() && !$2.getAttribute("draggable-data"))
      return false;
    ge4(B4), G3 && d.getRow(B4).open && d.exec("close-row", { id: B4, nested: true });
    const L5 = locate2($2), P4 = L5.cloneNode(true);
    P4.classList.remove("wx-selected"), P4.querySelectorAll("[tabindex]").forEach((q4) => q4.setAttribute("tabindex", "-1")), N3.appendChild(P4), Ke3(P4);
    const te4 = (F5 || 0) - J6.d, ue5 = fe4 ? U5 : 0;
    N3.style.width = Math.min(
      (s || 0) - ue5,
      Z3 && X6 <= (s || 0) ? De3 : De3 - ue5
    ) + te4 + "px";
    const He3 = Ge3(L5);
    w.offset = {
      x: te4,
      y: -Math.round(He3.height / 2)
    }, $e2.current || ($e2.current = o.clientY);
  }
  function Xt2(o, w) {
    const { from: N3 } = w, $2 = w.pos, B4 = Ge3(M2.current);
    $2.x = B4.x;
    const Y4 = We2.top;
    if ($2.y < Y4) $2.y = Y4;
    else {
      const L5 = B4.height - (Se4 && U5 > 0 ? U5 : Math.round(We2.sense / 2)) - We2.bottom;
      $2.y > L5 && ($2.y = L5);
    }
    if (M2.current.contains(w.targetNode)) {
      const L5 = locate2(w.targetNode), P4 = L5 && getID(L5);
      if (P4 && P4 !== N3) {
        w.to = P4;
        const te4 = a3 ? ie6?.offsetHeight : E4?.rowHeight;
        if (ie6 && ((T4 || 0) === 0 || $2.y > Y4 + te4 - 1)) {
          const ue5 = L5.getBoundingClientRect(), q4 = Ge3(ie6).y, xe5 = ue5.y, ze3 = q4 > xe5 ? -1 : 1, je3 = ze3 === 1 ? "after" : "before", Ye = d.getState().flatData, Ve2 = Math.abs(
            Ye.findIndex((we3) => we3.id === N3) - Ye.findIndex((we3) => we3.id === P4)
          ), me3 = Ve2 !== 1 ? je3 === "before" ? "after" : "before" : je3;
          if (Ve2 === 1 && (ze3 === -1 && o.clientY > $e2.current || ze3 === 1 && o.clientY < $e2.current))
            return;
          $e2.current = o.clientY, d.exec("move-item", {
            id: N3,
            target: P4,
            mode: me3,
            inProgress: true
          });
        }
      }
      p && p({ event: o, context: w });
    }
    zn2(o, B4, w, We2);
  }
  function Bt4(o, w) {
    const { from: N3, to: $2 } = w;
    d.exec("move-item", {
      id: N3,
      target: $2,
      inProgress: false
    }), tt3.current = setTimeout(() => {
      tt3.current = 0;
    }, 1), ge4(null), Ke3(null), $e2.current = null, At2(w);
  }
  function qt2() {
    const o = document.createElement("div");
    o.style.cssText = "position:absolute;left:-1000px;width:100px;padding:0px;margin:0px;min-height:100px;overflow-y:scroll;", document.body.appendChild(o);
    const w = o.offsetWidth - o.clientWidth;
    return document.body.removeChild(o), w;
  }
  const Ut2 = b3(() => Z3 && X6 <= (s || 0) ? { width: "100%" } : Te3 > 0 ? { width: `${Te3}px` } : void 0, [Z3, X6, s, Te3]), Qt3 = b3(
    () => (Te3 > 0 ? Te3 : s || 0) - (fe4 ? U5 : 0),
    [Te3, s, fe4, U5]
  ), wt3 = I4(null);
  function Zt2() {
    Promise.resolve().then(() => {
      let o = 0, w = et3;
      const N3 = wt3.current;
      N3 && (Array.from(N3.children).forEach(($2, B4) => {
        Ze3.current[et3 + B4] = $2.offsetHeight, o += $2.offsetHeight, w++;
      }), Wt3(o), Ft4(w));
    });
  }
  O4(() => {
    he5 && a3 && Zt2();
  }, [he5, a3, et3]);
  let [Me4, Fe4] = _2();
  O4(() => {
    if (j4 && (!l || !Oe2.length || Oe2.includes(j4.row)))
      Fe4({ ...j4 });
    else if (he5.length && J6.data.length) {
      if (!Me4 || Oe2.length && !Oe2.includes(Me4.row) || he5.findIndex((o) => o.id === Me4.row) === -1 || J6.data.findIndex(
        (o) => o.id === Me4.column && !o.collapsed
      ) === -1) {
        const o = Oe2[0] || he5[0].id, w = J6.data.findIndex((N3) => !N3.collapsed);
        Fe4(w !== -1 ? { row: o, column: J6.data[w].id } : null);
      }
    } else Fe4(null);
  }, [j4]);
  const gt3 = I4(null);
  O4(() => {
    const o = M2.current;
    if (!o) return;
    const w = $n2(o, m);
    return () => {
      typeof w == "function" && w();
    };
  }, [m]);
  const xt3 = I4({});
  Object.assign(xt3.current, {
    start: Gt3,
    move: Xt2,
    end: Bt4,
    getReorder: () => se5,
    getDraggableInfo: () => ({ hasDraggable: pt3() })
  }), O4(() => {
    const o = M2.current;
    return o ? An2(o, xt3).destroy : void 0;
  }, [se5, M2.current]), O4(() => {
    const o = M2.current;
    return o ? Ie3(o, {
      keys: S4 !== false && {
        ...Te2,
        "ctrl+z": Q5,
        "ctrl+y": Q5,
        ...S4
      },
      exec: (N3) => d.exec("hotkey", N3)
    }).destroy : void 0;
  }, [d, Q5, S4]);
  const _e4 = I4({
    scroll: d.getReactiveState().scroll,
    scrollLeft: d.getReactiveState().scrollLeft,
    scrollTop: d.getReactiveState().scrollTop
  });
  _e4.current.getWidth = () => (s || 0) - (fe4 ? U5 : 0), _e4.current.getHeight = () => Ne3, _e4.current.getScrollMargin = () => re3.width + ae4.width, O4(() => {
    Me3(gt3.current, _e4.current);
  }, []);
  const mt3 = I4(null);
  O4(() => {
    const o = mt3.current;
    if (!o) return;
    const w = [];
    w.push(
      clickOutside(o, () => j4 && d.exec("focus-cell", { eventSource: "click" })).destroy
    ), w.push(delegateClick2(o, Yt2.current)), Ee4(o.clientHeight);
    const N3 = new ResizeObserver(() => {
      Ee4(o.clientHeight);
    });
    return N3.observe(o), w.push(() => N3.disconnect()), () => w.forEach(($2) => $2());
  }, []);
  const Jt2 = `wx-grid ${R4 ? `wx-responsive-${R4}` : ""}`;
  return O4(() => {
    j4 && (he5.some((N3) => N3.id === j4.row) && J6.data.some(
      (N3) => N3.id === j4.column && !N3.collapsed
    ) || d.exec("focus-cell", { eventSource: "destroy" }));
  }, [J6, he5]), /* @__PURE__ */ ne5(Re4, { children: [
    /* @__PURE__ */ i2(
      "div",
      {
        className: "wx-4VuBwK2D " + Jt2,
        style: {
          "--header-height": `${Le4}px`,
          "--footer-height": `${Ce4}px`,
          "--split-left-width": `${re3.width}px`,
          "--split-right-width": `${ae4.width}px`
        },
        children: /* @__PURE__ */ i2(
          "div",
          {
            ref: M2,
            className: "wx-4VuBwK2D wx-table-box",
            style: Ut2,
            role: G3 ? "treegrid" : "grid",
            "aria-colcount": J6.data.length,
            "aria-rowcount": he5.length,
            "aria-multiselectable": G3 && h ? true : void 0,
            tabIndex: -1,
            children: /* @__PURE__ */ ne5(
              "div",
              {
                ref: gt3,
                className: "wx-4VuBwK2D wx-scroll",
                style: {
                  overflowX: Se4 ? "scroll" : "hidden",
                  overflowY: fe4 ? "scroll" : "hidden"
                },
                onScroll: _t3,
                children: [
                  e ? /* @__PURE__ */ i2("div", { className: "wx-4VuBwK2D wx-header-wrapper", children: /* @__PURE__ */ i2(
                    Ht2,
                    {
                      contentWidth: De3,
                      viewportWidth: Qt3,
                      deltaLeft: J6.dh,
                      columns: J6.header,
                      columnStyle: f,
                      bodyHeight: Pt4,
                      leftColumnsWidth: re3.width,
                      rightColumnsWidth: ae4.width
                    }
                  ) }) : null,
                  /* @__PURE__ */ ne5(
                    "div",
                    {
                      ref: mt3,
                      className: "wx-4VuBwK2D wx-body",
                      style: { width: `${De3}px`, height: `${ut2}px` },
                      onMouseDown: (o) => jt2(o),
                      children: [
                        r2 ? /* @__PURE__ */ i2(Qn2, { overlay: r2 }) : null,
                        /* @__PURE__ */ i2(
                          "div",
                          {
                            ref: wt3,
                            className: "wx-4VuBwK2D wx-data",
                            style: {
                              paddingTop: `${de5.d}px`,
                              paddingLeft: `${J6.d}px`
                            },
                            children: he5.map((o, w) => {
                              const N3 = D4.indexOf(o.id) !== -1, $2 = be5 === o.id, B4 = "wx-row" + (a3 ? " wx-autoheight" : "") + (c ? " " + c(o) : "") + (N3 ? " wx-selected" : "") + ($2 ? " wx-inactive" : ""), Y4 = a3 ? { minHeight: `${o.rowHeight || k2}px` } : { height: `${o.rowHeight || k2}px` };
                              return /* @__PURE__ */ i2(
                                "div",
                                {
                                  className: "wx-4VuBwK2D " + B4,
                                  "data-id": setID(o.id),
                                  "data-context-id": setID(o.id),
                                  style: Y4,
                                  role: "row",
                                  "aria-rowindex": w,
                                  "aria-expanded": o.open,
                                  "aria-level": G3 ? o.$level + 1 : void 0,
                                  "aria-selected": G3 ? N3 : void 0,
                                  tabIndex: -1,
                                  children: J6.data.map((L5) => L5.collapsed ? /* @__PURE__ */ i2(
                                    "div",
                                    {
                                      className: "wx-4VuBwK2D wx-cell wx-collapsed"
                                    },
                                    L5.id
                                  ) : A6?.id === o.id && A6.column === L5.id ? /* @__PURE__ */ i2(oo, { row: o, column: L5 }, L5.id) : /* @__PURE__ */ i2(
                                    Fn2,
                                    {
                                      row: o,
                                      column: L5,
                                      columnStyle: f,
                                      cellStyle: u,
                                      reorder: se5,
                                      focusable: Me4?.row === o.id && Me4?.column === L5.id
                                    },
                                    L5.id
                                  ))
                                },
                                o.id
                              );
                            })
                          }
                        )
                      ]
                    }
                  ),
                  n && (C4 || []).length ? /* @__PURE__ */ i2(
                    Ht2,
                    {
                      type: "footer",
                      contentWidth: De3,
                      deltaLeft: J6.df,
                      columns: J6.footer,
                      columnStyle: f
                    }
                  ) : null
                ]
              }
            )
          }
        )
      }
    ),
    V7 ? /* @__PURE__ */ i2(
      lo,
      {
        config: V7,
        rowStyle: c,
        columnStyle: f,
        cellStyle: u,
        header: e,
        footer: n,
        reorder: se5
      }
    ) : null
  ] });
}
var io = (t2) => t2.split("-").map((e) => e ? e.charAt(0).toUpperCase() + e.slice(1) : "").join("");
var bo = on2(function({
  data: e = [],
  columns: n = [],
  rowStyle: r2 = null,
  columnStyle: h = null,
  cellStyle: p = null,
  selectedRows: c,
  select: f = true,
  multiselect: u = false,
  header: a3 = true,
  footer: m = false,
  dynamic: s = null,
  overlay: v = null,
  reorder: R4 = false,
  onReorder: S4 = null,
  autoRowHeight: d = false,
  sizes: g,
  split: y4,
  tree: C4 = false,
  autoConfig: x3 = false,
  init: E4 = null,
  responsive: D4 = null,
  sortMarks: H3,
  undo: l = false,
  hotkeys: A6 = null,
  filterValues: F5,
  ...T4
}, G3) {
  const j4 = I4();
  j4.current = T4;
  const V7 = b3(() => new ve2(writable), []), Q5 = b3(() => V7.in, [V7]), se5 = I4(null);
  se5.current === null && (se5.current = new EventBusRouter((z4, X6) => {
    const le4 = "on" + io(z4);
    j4.current && j4.current[le4] && j4.current[le4](X6);
  }), Q5.setNext(se5.current));
  const oe3 = b3(
    () => ({
      getState: V7.getState.bind(V7),
      getReactiveState: V7.getReactive.bind(V7),
      getStores: () => ({ data: V7 }),
      exec: Q5.exec,
      setNext: (z4) => (se5.current = se5.current.setNext(z4), se5.current),
      intercept: Q5.intercept.bind(Q5),
      on: Q5.on.bind(Q5),
      detach: Q5.detach.bind(Q5),
      getRow: V7.getRow.bind(V7),
      getColumn: V7.getColumn.bind(V7)
    }),
    [V7, Q5]
  ), [U5, Ie5] = _2(0), [ve3, Ee4] = _2(0), [Z3, k2] = _2(null), [M2, be5] = _2(null), ge4 = b3(() => {
    if (x3 && !n.length && e.length) {
      const z4 = e[0], X6 = [];
      for (let le4 in z4)
        if (le4 !== "id" && le4[0] !== "$") {
          let pe4 = {
            id: le4,
            header: le4[0].toUpperCase() + le4.slice(1)
          };
          typeof x3 == "object" && (pe4 = { ...pe4, ...x3 }), X6.push(pe4);
        }
      return X6;
    }
    return (M2 && M2.columns) ?? n;
  }, [x3, n, e, M2]), ie6 = b3(
    () => (M2 && M2.sizes) ?? g,
    [M2, g]
  ), Ke3 = W4(
    (z4) => {
      if (Ie5(z4.width), Ee4(z4.height), D4) {
        const le4 = Object.keys(D4).map(Number).sort((pe4, J6) => pe4 - J6).find((pe4) => z4.width <= pe4) ?? null;
        le4 !== Z3 && (be5(D4[le4]), k2(le4));
      }
    },
    [D4, Z3]
  ), re3 = ee3(Qt.theme), ae4 = I4(0);
  return O4(() => {
    if (!ae4.current)
      E4 && E4(oe3);
    else {
      const z4 = V7.getState();
      V7.init({
        data: e,
        columns: ge4,
        split: y4 || z4.split,
        sizes: ie6 || z4.sizes,
        selectedRows: c || z4.selectedRows,
        dynamic: s,
        tree: C4,
        sortMarks: H3 || z4.sortMarks,
        filterValues: F5 || z4.filterValues,
        undo: l,
        reorder: R4,
        _skin: re3,
        _select: f
      });
    }
    ae4.current++;
  }, [
    V7,
    e,
    ge4,
    y4,
    ie6,
    c,
    s,
    C4,
    H3,
    F5,
    l,
    R4,
    re3,
    f,
    E4,
    oe3
  ]), ae4.current === 0 && V7.init({
    data: e,
    columns: ge4,
    split: y4 || { left: 0 },
    sizes: ie6 || {},
    selectedRows: c || [],
    dynamic: s,
    tree: C4,
    sortMarks: H3 || {},
    filterValues: F5 || {},
    undo: l,
    reorder: R4,
    _skin: re3,
    select: f
  }), rn2(
    G3,
    () => ({
      ...oe3
    }),
    [oe3]
  ), /* @__PURE__ */ i2(ce4.Provider, { value: oe3, children: /* @__PURE__ */ i2(pe, { words: en_default3, optional: true, children: /* @__PURE__ */ i2(
    so,
    {
      header: a3,
      footer: m,
      overlay: v,
      rowStyle: r2,
      columnStyle: h,
      cellStyle: p,
      onReorder: S4,
      multiselect: u,
      autoRowHeight: d,
      clientWidth: U5,
      clientHeight: ve3,
      responsiveLevel: Z3,
      resize: Ke3,
      hotkeys: A6
    }
  ) }) });
});
function Ho({ fonts: t2 = true, children: e }) {
  return e ? /* @__PURE__ */ i2(yn, { fonts: t2, children: e }) : /* @__PURE__ */ i2(yn, { fonts: t2 });
}
function ko({ fonts: t2 = true, children: e }) {
  return e ? /* @__PURE__ */ i2(bn, { fonts: t2, children: e }) : /* @__PURE__ */ i2(bn, { fonts: t2 });
}
setEnv(env2);

// node_modules/@svar-ui/react-gantt/dist/index.es.js
import { flushSync as kn3 } from "react-dom";

// node_modules/@svar-ui/react-editor/dist/index.es.js
import { jsxs as R3, jsx as a } from "react/jsx-runtime";
import { useRef as X5, useEffect as J5, useContext as _3, useMemo as T3, useState as U4, useCallback as Ee3 } from "react";
var ee4 = {};
function z3(t2, e) {
  ee4[t2] = e;
}
function Ie4({ value: t2, options: e, label: o }) {
  const r2 = _3(Qt.i18n).getGroup("editor"), u = T3(() => {
    let n = t2;
    if (typeof t2 == "boolean" && (n = r2(t2 ? "Yes" : "No")), e) {
      const s = e.find((c) => c.id === t2);
      s && (n = s.label);
    }
    return n;
  }, [t2, e, r2]);
  return u || u === 0 ? /* @__PURE__ */ a(Se, { label: o, children: u }) : null;
}
function Re5({ fieldKey: t2, label: e, activeSection: o, onClick: l }) {
  return /* @__PURE__ */ R3(
    "div",
    {
      className: `wx-OmgQq65I wx-section${o ? " wx-section-active" : ""}`,
      onClick: () => l && l({
        item: { id: "toggle-section", key: o ? null : t2 }
      }),
      children: [
        /* @__PURE__ */ a("h3", { children: e }),
        /* @__PURE__ */ a(
          "i",
          {
            className: `wx-OmgQq65I wxi-angle-${o ? "down" : "right"} wx-icon`
          }
        )
      ]
    }
  );
}
z3("text", ke);
z3("textarea", zt);
z3("checkbox", _e);
z3("readonly", Ie4);
z3("section", Re5);
setEnv(env2);

// node_modules/@svar-ui/react-gantt/dist/index.es.js
var Be3 = Ot3(null);
function Cn2(t2, e, s) {
  const n = t2.getBoundingClientRect(), o = e.querySelector(".wx-body").getBoundingClientRect();
  return {
    top: n.top - o.top,
    left: n.left - o.left,
    dt: n.bottom - s.clientY,
    db: s.clientY - n.top
  };
}
function kt4(t2) {
  return t2 && getID(t2, "data-context-id");
}
var vt3 = 5;
function Sn(t2, e) {
  let s, n, o, l, g, f, u, i3, w;
  function H3($2) {
    l = $2.clientX, g = $2.clientY, f = {
      ...Cn2(s, t2, $2),
      y: e.getTask(o).$y
    }, document.body.style.userSelect = "none";
  }
  function L5($2) {
    e.isDisabled?.() || (s = locate2($2), kt4(s) && (o = getID(s), w = setTimeout(() => {
      i3 = true, e && e.touchStart && e.touchStart(), H3($2.touches[0]);
    }, 500), t2.addEventListener("touchmove", ne6), t2.addEventListener("contextmenu", S4), window.addEventListener("touchend", ee5)));
  }
  function S4($2) {
    if (i3 || w)
      return $2.preventDefault(), false;
  }
  function v($2) {
    e.isDisabled?.() || $2.which !== 1 || (s = locate2($2), kt4(s) && (o = getID(s), t2.addEventListener("mousemove", Q5), window.addEventListener("mouseup", G3), H3($2)));
  }
  function z4($2) {
    t2.removeEventListener("mousemove", Q5), t2.removeEventListener("touchmove", ne6), document.body.removeEventListener("mouseup", G3), document.body.removeEventListener("touchend", ee5), document.body.style.userSelect = "", $2 && (t2.removeEventListener("mousedown", v), t2.removeEventListener("touchstart", L5));
  }
  function R4($2) {
    const q4 = $2.clientX - l, te4 = $2.clientY - g;
    if (!n) {
      if (Math.abs(q4) < vt3 && Math.abs(te4) < vt3 || e && e.start && e.start({ id: o, e: $2 }) === false)
        return;
      n = s.cloneNode(true), n.style.pointerEvents = "none", n.classList.add("wx-reorder-task"), n.style.position = "absolute", n.style.left = f.left + "px", n.style.top = f.top + "px", s.style.visibility = "hidden", s.parentNode.insertBefore(n, s);
    }
    if (n) {
      const X6 = Math.round(Math.max(0, f.top + te4));
      if (e && e.move && e.move({ id: o, top: X6, detail: u }) === false)
        return;
      const E4 = e.getTask(o), B4 = E4.$y;
      if (!f.start && f.y === B4) return O5();
      f.start = true, f.y = E4.$y - 4, n.style.top = X6 + "px";
      const K4 = document.elementFromPoint(
        $2.clientX,
        $2.clientY
      ), F5 = locate2(K4);
      if (F5 && F5 !== s) {
        const N3 = getID(F5), D4 = F5.getBoundingClientRect(), d = D4.top + D4.height / 2, M2 = $2.clientY + f.db > d && F5.nextElementSibling !== s, U5 = $2.clientY - f.dt < d && F5.previousElementSibling !== s;
        u?.after === N3 || u?.before === N3 ? u = null : M2 ? u = { id: o, after: N3 } : U5 && (u = { id: o, before: N3 });
      }
    }
  }
  function Q5($2) {
    R4($2);
  }
  function ne6($2) {
    i3 ? ($2.preventDefault(), R4($2.touches[0])) : w && (clearTimeout(w), w = null);
  }
  function ee5() {
    i3 = null, w && (clearTimeout(w), w = null), O5();
  }
  function G3() {
    O5();
  }
  function O5() {
    s && (s.style.visibility = ""), n && (n.parentNode.removeChild(n), e && e.end && e.end({ id: o, top: f.top })), o = s = n = f = u = null, z4();
  }
  return t2.style.position !== "absolute" && (t2.style.position = "relative"), t2.addEventListener("mousedown", v), t2.addEventListener("touchstart", L5), {
    destroy() {
      z4(true);
    }
  };
}
function Rn2(t2) {
  const { row: e } = t2, s = be4(Qt.i18n), n = x2(() => s.getGroup("gantt"), [s]), o = be4(Be3), l = useStore(o, "groupBy"), g = useStore(o, "resources"), f = x2(() => {
    if (l?.field === "resource") {
      let i3 = e.$groupValue;
      return Array.isArray(i3) || (i3 = [i3]), i3.map((w) => g.byId(w)).filter(Boolean);
    }
    return null;
  }, [l, g, e]), u = x2(
    () => l?.field === "resource" ? n("Unassigned") : n("Ungrouped"),
    [l, n]
  );
  return /* @__PURE__ */ a2("div", { className: "wx-group-text wx-aab2WKOu", children: e.$groupValue === "$ungrouped" ? u : f?.length ? /* @__PURE__ */ ue4(Pe2, { children: [
    /* @__PURE__ */ a2(Nn, { value: f, size: 28 }),
    f.length === 1 && /* @__PURE__ */ a2("span", { className: "wx-name wx-aab2WKOu", children: f[0].name })
  ] }) : e.text });
}
function $n3({ row: t2, column: e }) {
  function s(o, l) {
    return {
      justifyContent: l.align,
      paddingLeft: `${(o.$level - 1) * 20}px`
    };
  }
  const n = e && e._cell;
  return /* @__PURE__ */ ue4("div", { className: "wx-pqc08MHU wx-content", style: s(t2, e), children: [
    !t2.$empty && (t2.data?.length || t2.lazy) ? /* @__PURE__ */ a2(
      "i",
      {
        className: `wx-pqc08MHU wx-toggle-icon wxi-menu-${t2.open ? "down" : "right"}`,
        "data-action": "open-task"
      }
    ) : /* @__PURE__ */ a2("i", { className: "wx-pqc08MHU wx-toggle-placeholder" }),
    /* @__PURE__ */ a2("div", { className: "wx-pqc08MHU wx-text", children: n ? /* @__PURE__ */ a2(n, { row: t2, column: e }) : t2.$group ? /* @__PURE__ */ a2(Rn2, { row: t2 }) : t2.text })
  ] });
}
function Xe3({ column: t2, row: e, cell: s }) {
  const n = x2(() => t2.id, [t2?.id]), o = x2(() => n.includes("edit") ? "wxi-edit" : n.includes("add") ? "wxi-plus" : n.includes("delete") ? "wxi-delete" : "", [n]), l = x2(() => {
    if (!n.includes("add")) return false;
    const g = e.$groupValue;
    return !e.$group && typeof g < "u" || e.$group && typeof g > "u";
  }, [n, e]);
  return s || o ? /* @__PURE__ */ a2("div", { style: { textAlign: t2.align }, children: /* @__PURE__ */ a2(
    "i",
    {
      className: `wx-9DAESAHW wx-action-icon ${o}${l ? " wx-disabled" : ""}`,
      "data-action": !l && n
    }
  ) }) : null;
}
function Nn3({ row: t2 }) {
  const e = be4(Be3), s = useStore(e, "assignments"), n = x2(
    () => e.getTaskResources(t2.$id || t2.id),
    [e, s, t2]
  );
  return /* @__PURE__ */ a2("div", { className: "wx-aadpwBM9 wx-avatar", children: /* @__PURE__ */ a2(Nn, { value: n, size: 28 }) });
}
function bt3(t2) {
  const { data: e } = t2, s = x2(() => e.length, [e]);
  return Array.isArray(e) ? /* @__PURE__ */ a2("div", { className: "wx-avatar-box wx-aaexf6PM", children: s ? /* @__PURE__ */ a2(Nn, { value: e, size: 28 }) : null }) : /* @__PURE__ */ ue4("div", { className: "wx-resource-option wx-aaexf6PM", children: [
    /* @__PURE__ */ a2("div", { className: "wx-aaexf6PM", children: /* @__PURE__ */ a2(Nn, { value: e, size: 28 }) }),
    /* @__PURE__ */ a2("div", { className: "wx-name wx-aaexf6PM", children: e.name })
  ] });
}
function En2(t2, e, s) {
  const { _assignments: n } = s.getState(), o = n.byTask[t2], l = o?.map((i3) => i3.resource), g = new Set(l || []), f = new Set(e || []), u = s.getHistory();
  u && u.startBatch();
  for (const i3 of g)
    if (!f.has(i3)) {
      const w = o.find((H3) => H3.resource === i3);
      s.exec("delete-assignment", { id: w.id });
    }
  for (const i3 of f)
    g.has(i3) || s.exec("add-assignment", {
      assignment: {
        resource: i3,
        task: t2
      }
    });
  u && u.endBatch();
}
function Mn3(t2, e) {
  return `min-height:${t2 + e * 4}px;`;
}
function Ln2(t2, e, s) {
  return s && t2 === "all" ? `width:${e}px;` : t2 === "grid" ? s ? `width:${e}px;` : "width:100%;" : "";
}
function zt4(t2, e, s) {
  const n = t2.find((o) => o.id === "add-task");
  return e === "all" ? `${s}px` : e === "grid" ? "calc(100% - 4px)" : n ? `${n.width}px` : "0";
}
function An3(t2, e, s, n, o) {
  return !t2 && e !== "grid" ? s > o : s > n;
}
function Dt4(t2, e, s = "add-task") {
  return e === "chart" ? [
    {
      ...t2.filter((n) => n.id === s)[0],
      resize: false
    }
  ] : t2;
}
function It3(t2, e) {
  const s = (n) => n.id !== "add-task" && n.id !== e && !n.hidden;
  return t2.filter(s).reduce((n, o) => !n || o.width > n.width ? o : n, null)?.id;
}
function tt2(t2) {
  return t2.reduce((e, s) => e + (s.hidden ? 0 : s.width), 0);
}
function _t2(t2, e) {
  if (t2 && e?.length) {
    const s = {};
    return e.forEach(({ key: n, order: o }, l) => {
      s[n] = {
        order: o,
        ...e.length > 1 && { index: l }
      };
    }), s;
  }
  return {};
}
function zn3(t2) {
  const e = {};
  return t2.split(";").forEach((s) => {
    const n = s.indexOf(":");
    if (n === -1) return;
    const o = s.slice(0, n).trim(), l = s.slice(n + 1).trim();
    if (!o) return;
    const g = o.startsWith("--") ? o : o.replace(/-([a-z])/g, (f, u) => u.toUpperCase());
    e[g] = l;
  }), e;
}
function Dn2(t2) {
  const { readonly: e, onTableAPIChange: s } = t2, [n, o] = ce5(0), [l, g] = ce5(), f = be4(Qt.i18n), u = x2(() => f.getGroup("gantt"), [f]), i3 = be4(Be3), w = useStore(i3, "scrollTop"), H3 = useStore(i3, "cellHeight"), L5 = useStore(i3, "focusTask"), S4 = useStore(i3, "_selected"), v = useStore(i3, "area"), z4 = useStore(i3, "_tasks"), R4 = useStore(i3, "_scales"), Q5 = useStore(i3, "_headerLength"), ne6 = useStore(i3, "columns"), ee5 = useStore(i3, "_sort"), G3 = useStore(i3, "durationUnit"), O5 = useStore(i3, "splitTasks"), $2 = useStore(i3, "filterValues"), q4 = useStore(i3, "groupBy"), te4 = useStore(i3, "gridWidth"), X6 = useStore(i3, "displayMode"), E4 = useStore(i3, "_compactMode"), [B4, K4] = ce5(null), F5 = x2(() => !z4 || !v ? [] : z4.slice(v.start, v.end), [z4, v]), N3 = A5(
    (m, c) => {
      if (c === "add-task")
        i3.exec(c, {
          target: m,
          task: { text: u("New Task") },
          mode: "child",
          show: true,
          focus: m ? "grid" : null
        });
      else if (c === "open-task") {
        const h = F5.find((_4) => _4.id === m);
        (h?.data || h?.lazy) && i3.exec(c, { id: m, mode: !h.open });
      }
    },
    [F5]
  ), D4 = A5(
    (m) => {
      if (m.detail > 1) return;
      const c = locateID(m), h = m.target.dataset.action;
      h && m.preventDefault(), c ? h === "add-task" || h === "open-task" ? N3(c, h) : i3.exec("select-task", {
        id: c,
        toggle: m.ctrlKey || m.metaKey,
        range: m.shiftKey,
        show: "xy",
        focus: "grid"
      }) : h === "add-task" && N3(null, h);
    },
    [i3, N3]
  ), d = V6(null), M2 = V6(null), [U5, le4] = ce5(0), [ae4, re3] = ce5(0);
  ie5(() => {
    const m = M2.current;
    if (!m || typeof ResizeObserver > "u") return;
    const c = () => {
      le4(m.clientWidth), re3(m.clientHeight);
    };
    c();
    const h = new ResizeObserver(c);
    return h.observe(m), () => h.disconnect();
  }, []);
  const j4 = x2(() => (B4 && !F5.find((c) => c.id === B4.id) ? [...F5, B4] : F5).map((c) => ({ ...c })), [F5, B4]), Z3 = V6(j4);
  ie5(() => {
    Z3.current = j4;
  }, [j4]);
  const k2 = V6(null), P4 = A5(
    (m) => {
      const c = m.id, { before: h, after: _4 } = m, C4 = m.onMove;
      let y4 = h || _4, r2 = h ? "before" : "after";
      if (C4) {
        if (r2 === "after") {
          const T4 = Z3.current.findIndex((fe4) => fe4.id === c), Y4 = Z3.current.findIndex(
            (fe4) => fe4.id === y4
          ), J6 = Z3.current[Y4];
          T4 - Y4 === 1 ? r2 = "before" : J6 && J6.data && J6.open && (r2 = "before", y4 = J6.data[0].id);
        }
        k2.current = { id: c, [r2]: y4 };
      } else k2.current = null;
      i3.exec("move-task", {
        id: c,
        mode: r2,
        target: y4,
        inProgress: C4
      });
    },
    [i3]
  ), se5 = x2(() => {
    let m = (ne6 || []).map((C4) => {
      C4 = { ...C4 };
      const y4 = [...C4.header];
      return y4.forEach((r2) => {
        r2.text && (r2.text = u(r2.text));
      }), C4.header = y4, C4;
    });
    const c = m.findIndex((C4) => C4.id === "text"), h = m.findIndex((C4) => C4.id === "add-task"), _4 = m.findIndex((C4) => C4.id === "resources");
    if (c !== -1 && (m[c].cell && (m[c]._cell = m[c].cell), m[c].cell = $n3), _4 !== -1) {
      const C4 = m[_4];
      if (C4.cell || (C4.cell = Nn3), C4.editor && typeof C4.editor != "function") {
        const y4 = C4.editor, r2 = y4.config;
        r2.cell || (r2.cell = bt3), r2.cell = bt3, r2.dropdown || (r2.dropdown = { width: "auto" }), C4.editor = (T4) => {
          if (T4.type !== "summary") return y4;
        };
      }
    }
    if (h !== -1) {
      m[h].cell = m[h].cell || Xe3;
      const C4 = m[h].header[0];
      if (m[h].header[0].cell = C4.cell || Xe3, e)
        m.splice(h, 1);
      else if (E4) {
        const [y4] = m.splice(h, 1);
        m.unshift(y4);
      }
    }
    return m.length > 0 && (m[m.length - 1].resize = false), m;
  }, [ne6, u, e, E4]);
  at2(() => {
    o(tt2(se5));
  }, [se5]);
  const we3 = A5((m) => {
    let c = `wx-rHj6070p wx-text-${m.align} `;
    return m.id === "add-task" ? c += "wx-action " : m.id === "wbs" && (c += "wx-wbs "), c.trim();
  }, []), de5 = x2(() => v?.from ?? 0, [v]), I6 = x2(() => R4?.height ?? 0, [R4]), Te3 = x2(
    () => zt4(ne6 || [], X6, te4),
    [ne6, X6, te4]
  ), ve3 = x2(
    () => An3(
      E4,
      X6,
      n,
      U5,
      te4
    ),
    [E4, X6, n, U5, te4]
  ), xe5 = x2(
    () => (de5 ?? 0) - (w ?? 0),
    [de5, w]
  ), me3 = x2(() => {
    const m = Mn3(ae4, H3 ?? 0) + Ln2(X6, n, ve3), c = zn3(m);
    return c["--wx-body-offset"] = `${xe5}px`, c;
  }, [
    ae4,
    H3,
    X6,
    n,
    ve3,
    xe5
  ]), ge4 = x2(
    () => Array.isArray(S4) ? S4.map((m) => m.id) : [],
    [S4]
  ), ke3 = x2(
    () => Dt4(se5, X6),
    [se5, X6]
  ), pe4 = A5(
    (m) => {
      if (!e) {
        const c = locateID(m), h = locateID(m, "data-col-id");
        !(h && se5.find((C4) => C4.id === h))?.editor && c && i3.exec("show-editor", { id: c });
      }
    },
    [i3, e, se5]
  ), he5 = x2(
    () => _t2(j4, ee5),
    [j4, ee5]
  ), Ce4 = x2(() => he5 ? { ...$2 } : $2, [he5, $2]), Ee4 = V6(false);
  ie5(() => {
    if (!L5 || !l) return;
    const { id: m, column: c } = L5;
    c && (Ee4.current || (Ee4.current = true, requestAnimationFrame(() => {
      const { focusCell: h, editor: _4 } = l.getState();
      _4 || (l.exec("focus-cell", {
        row: m,
        column: h?.column || se5[0]?.id
      }), Ee4.current = false);
    })));
  }, [L5, l]);
  const ze3 = A5(
    ({ id: m }) => {
      if (e) return false;
      i3.getTask(m).open && i3.exec("open-task", { id: m, mode: false });
      const c = i3.getState()._tasks.find((h) => h.id === m);
      if (K4(c || null), !c) return false;
    },
    [i3, e]
  ), $e2 = A5(
    ({ id: m, top: c }) => {
      k2.current ? P4({ ...k2.current, onMove: false }) : i3.exec("drag-task", {
        id: m,
        top: c + (de5 ?? 0),
        inProgress: false
      }), K4(null);
    },
    [i3, P4, de5]
  ), Me4 = A5(
    ({ id: m, top: c, detail: h }) => {
      h && P4({ ...h, onMove: true }), i3.exec("drag-task", {
        id: m,
        top: c + (de5 ?? 0),
        inProgress: true
      });
    },
    [i3, P4, de5]
  ), Ae4 = V6(q4);
  ie5(() => {
    Ae4.current = q4;
  }, [q4]), ie5(() => {
    const m = d.current;
    return m ? Sn(m, {
      isDisabled: () => !!Ae4.current?.field,
      start: ze3,
      end: $e2,
      move: Me4,
      getTask: i3.getTask
    }).destroy : void 0;
  }, [i3, ze3, $e2, Me4]);
  const Ne3 = A5(
    (m) => {
      const { key: c, isInput: h } = m;
      if (!h && (c === "arrowup" || c === "arrowdown"))
        return m.eventSource = "grid", i3.exec("hotkey", m), false;
      if (c === "enter") {
        const _4 = l?.getState().focusCell;
        if (_4) {
          const { row: C4, column: y4 } = _4;
          y4 === "add-task" ? N3(C4, "add-task") : y4 === "text" && N3(C4, "open-task");
        }
      }
    },
    [i3, N3, l]
  ), b4 = V6(null), W5 = () => {
    b4.current = {
      setTableAPI: g,
      handleHotkey: Ne3,
      sortVal: ee5,
      api: i3,
      cols: se5,
      setColumnWidth: o,
      tasks: F5,
      durationUnitVal: G3,
      splitTasksVal: O5,
      onTableAPIChange: s
    };
  };
  W5(), ie5(() => {
    W5();
  }, [
    g,
    Ne3,
    ee5,
    i3,
    se5,
    o,
    F5,
    G3,
    O5,
    s
  ]);
  const oe3 = A5((m) => {
    g(m), m.intercept("hotkey", (c) => b4.current.handleHotkey(c)), m.intercept("select-row", () => false), m.intercept("scroll", () => false), m.intercept("sort-rows", (c) => {
      const h = b4.current.sortVal, { key: _4, add: C4 } = c, y4 = h ? h.find((T4) => T4.key === _4) : null;
      let r2 = "asc";
      return y4 && (r2 = !y4 || y4.order === "asc" ? "desc" : "asc"), i3.exec("sort-tasks", {
        key: _4,
        order: r2,
        add: C4
      }), false;
    }), m.intercept("filter-rows", (c) => {
      const { key: h, value: _4 } = c;
      return i3.exec("filter-tasks", {
        key: h,
        value: _4,
        open: true
      }), false;
    }), m.intercept("resize-column", (c) => {
      c.flexgrowFallback = It3(b4.current.cols, c.id);
    }), m.on("resize-column", (c) => {
      const h = m.getState().columns;
      b4.current.setColumnWidth(tt2(h)), c.inProgress !== true && i3.exec("set-columns", { columns: h });
    }), m.on("hide-column", () => {
      const c = m.getState().columns;
      b4.current.setColumnWidth(tt2(c)), i3.exec("set-columns", { columns: c });
    }), m.intercept("update-cell", (c) => {
      const { id: h, column: _4, value: C4 } = c, y4 = b4.current.tasks.find((r2) => r2.id === h);
      if (y4) {
        if (_4 === "resources") {
          En2(h, C4, i3);
          return;
        }
        const r2 = { ...y4 };
        let T4 = C4;
        T4 && !isNaN(T4) && !(T4 instanceof Date) && (T4 *= 1), r2[_4] = T4, ha(
          r2,
          {
            durationUnit: b4.current.durationUnitVal,
            splitTasks: b4.current.splitTasksVal
          },
          i3.getTaskCalendar(r2),
          _4
        ), i3.exec("update-task", {
          id: h,
          task: r2
        });
      }
      return false;
    }), s && s(m);
  }, []);
  return /* @__PURE__ */ a2(
    "div",
    {
      className: "wx-rHj6070p wx-table-container",
      style: { flex: `0 0 ${Te3}` },
      ref: M2,
      children: /* @__PURE__ */ a2(
        "div",
        {
          ref: d,
          style: me3,
          className: "wx-rHj6070p wx-table",
          onClick: D4,
          onDoubleClick: pe4,
          children: /* @__PURE__ */ a2(
            bo,
            {
              init: oe3,
              sizes: {
                rowHeight: H3,
                headerHeight: (I6 ?? 0) / (Q5 ?? 1)
              },
              rowStyle: (m) => m.$reorder ? "wx-rHj6070p wx-reorder-task" : "wx-rHj6070p",
              columnStyle: we3,
              data: j4,
              columns: ke3,
              selectedRows: [...ge4],
              sortMarks: he5,
              filterValues: Ce4
            }
          )
        }
      )
    }
  );
}
function In3() {
  const t2 = be4(Be3), e = useStore(t2, "cellWidth"), s = useStore(t2, "cellHeight"), n = useStore(t2, "cellBorders"), o = V6(null), [l, g] = ce5("#e4e4e4");
  ie5(() => {
    if (typeof getComputedStyle < "u" && o.current) {
      const u = getComputedStyle(o.current).getPropertyValue(
        "--wx-gantt-border"
      );
      g(u ? u.substring(u.indexOf("#")) : "#1d1e261a");
    }
  }, []);
  const f = {
    width: "100%",
    height: "100%",
    background: e != null && s != null ? `url(${ga(e, s, l, n)})` : void 0,
    position: "absolute"
  };
  return /* @__PURE__ */ a2("div", { ref: o, style: f });
}
function _n3({ onSelectLink: t2, selectedLink: e, readonly: s }) {
  const n = be4(Be3), o = useStore(n, "_visibleLinks"), l = useStore(n, "criticalPath"), g = V6(null), f = A5(
    (u) => {
      const i3 = u?.target?.classList;
      !i3?.contains("wx-line-hitbox") && !i3?.contains("wx-delete-button") && t2(null);
    },
    [t2]
  );
  return ie5(() => {
    if (!s && e && g.current) {
      const u = (i3) => {
        g.current && !g.current.contains(i3.target) && f(i3);
      };
      return document.addEventListener("click", u), () => {
        document.removeEventListener("click", u);
      };
    }
  }, [s, e, f]), /* @__PURE__ */ ue4("svg", { className: "wx-dkx3NwEn wx-links", children: [
    (o || []).map((u) => {
      const i3 = "wx-dkx3NwEn wx-line" + (l && u.critical ? " wx-critical" : "") + (s ? "" : " wx-line-selectable");
      return /* @__PURE__ */ ue4(
        "g",
        {
          className: i3,
          onClick: () => !s && t2(u.id),
          "data-link-id": setID(u.id),
          children: [
            /* @__PURE__ */ a2("polyline", { className: "wx-dkx3NwEn wx-line-draw", points: u.$p }),
            /* @__PURE__ */ a2("polyline", { className: "wx-dkx3NwEn wx-line-hitbox", points: u.$p })
          ]
        },
        u.id
      );
    }),
    !s && e && /* @__PURE__ */ ue4(
      "g",
      {
        ref: g,
        className: "wx-dkx3NwEn wx-line wx-line-selected wx-line-selectable wx-delete-link",
        "data-link-id": setID(e.id),
        children: [
          /* @__PURE__ */ a2(
            "polyline",
            {
              className: "wx-dkx3NwEn wx-line-draw",
              points: e.$p
            }
          ),
          /* @__PURE__ */ a2(
            "polyline",
            {
              className: "wx-dkx3NwEn wx-line-hitbox",
              points: e.$p
            }
          )
        ]
      }
    )
  ] });
}
function Gn3(t2) {
  const { task: e, type: s } = t2;
  function n(l) {
    const g = e.segments[l];
    return {
      left: `${g.$x}px`,
      top: "0px",
      width: `${g.$w}px`,
      height: "100%"
    };
  }
  function o(l) {
    if (!e.progress) return 0;
    const g = e.duration * e.progress / 100, f = e.segments;
    let u = 0, i3 = 0, w = null;
    do {
      const H3 = f[i3];
      i3 === l && (u > g ? w = 0 : w = Math.min((g - u) / H3.duration, 1) * 100), u += H3.duration, i3++;
    } while (w === null && i3 < f.length);
    return w || 0;
  }
  return /* @__PURE__ */ a2("div", { className: "wx-segments wx-GKbcLEGA", children: e.segments.map((l, g) => /* @__PURE__ */ ue4(
    "div",
    {
      className: `wx-segment wx-bar wx-${s} wx-GKbcLEGA`,
      "data-segment": g,
      style: n(g),
      children: [
        e.progress ? /* @__PURE__ */ a2("div", { className: "wx-progress-wrapper", children: /* @__PURE__ */ a2(
          "div",
          {
            className: "wx-progress-percent wx-GKbcLEGA",
            style: { width: `${o(g)}%` }
          }
        ) }) : null,
        /* @__PURE__ */ a2("div", { className: "wx-content", children: l.text || "" })
      ]
    },
    g
  )) });
}
function Pn3(t2) {
  const { rollup: e, parent: s } = t2;
  return /* @__PURE__ */ a2(
    "div",
    {
      "data-rollup-id": setID(e.id),
      className: `wx-GKbcLEGA wx-rollup wx-${e.type}-rollup`,
      style: {
        left: `${e.$x_rollup}px`,
        top: `${s.$y + s.$h + e.$y_rollup_relative}px`,
        width: `${e.$w_rollup}px`,
        height: `${e.$h_rollup}px`
      }
    }
  );
}
function Vn3(t2) {
  const { readonly: e, taskTemplate: s } = t2, n = be4(Be3), [o, l] = useStoreWithCounter(n, "_tasks"), [g, f] = useStoreWithCounter(n, "_links"), u = useStore(n, "area"), i3 = useStore(n, "_scales"), w = useStore(n, "taskTypes"), H3 = useStore(n, "baselines"), L5 = useStore(n, "_selected"), S4 = useStore(n, "rollups"), v = useStore(n, "_rollups"), z4 = useStore(n, "focusTask"), R4 = useStore(n, "criticalPath"), Q5 = useStore(n, "tree"), ne6 = useStore(n, "schedule"), ee5 = useStore(n, "splitTasks"), G3 = useStore(n, "summary"), O5 = useStore(n, "slack"), $2 = x2(() => {
    if (!u || !Array.isArray(o)) return [];
    const r2 = u.start ?? 0, T4 = u.end ?? 0;
    return o.slice(r2, T4).map((Y4) => ({ ...Y4 }));
  }, [l, u]), q4 = x2(
    () => i3.lengthUnitWidth,
    [i3]
  ), te4 = x2(
    () => $2.some((r2) => r2.$id && r2.$id !== r2.id),
    [$2]
  ), X6 = V6(false), [E4, B4] = ce5(void 0), [K4, F5] = ce5(null), N3 = V6(null), [D4, d] = ce5(null), M2 = x2(() => D4 && {
    ...g.find((r2) => r2.id === D4)
  }, [D4, f]), [U5, le4] = ce5(void 0), ae4 = V6(null), [re3, j4] = ce5(0), Z3 = V6(null), k2 = x2(() => {
    const r2 = Z3.current;
    return !!(L5.length && r2 && r2.contains(document.activeElement));
  }, [L5, Z3.current]), P4 = x2(() => k2 && L5[L5.length - 1]?.id, [k2, L5]);
  ie5(() => {
    if (z4 && z4.column === false) {
      const { id: r2 } = z4, T4 = Z3.current?.querySelector(
        `.wx-bar[data-id='${setID(r2)}']`
      );
      T4 && T4.focus({ preventScroll: true });
    }
  }, [z4]), ie5(() => {
    const r2 = Z3.current;
    if (r2 && (j4(r2.offsetWidth || 0), typeof ResizeObserver < "u")) {
      const T4 = new ResizeObserver((Y4) => {
        Y4[0] && j4(Y4[0].contentRect.width);
      });
      return T4.observe(r2), () => T4.disconnect();
    }
  }, [Z3.current]);
  const se5 = A5(() => {
    document.body.style.userSelect = "none";
  }, []), we3 = A5(() => {
    document.body.style.userSelect = "";
  }, []), de5 = A5(
    (r2, T4, Y4) => {
      if (T4.target.classList.contains("wx-line") || (Y4 || (Y4 = n.getTask(getID(r2))), Y4.type === "milestone" || Y4.type === "summary")) return "";
      const J6 = locate2(T4, "data-segment");
      J6 && (r2 = J6);
      const { left: fe4, width: ye4 } = r2.getBoundingClientRect(), Se4 = (T4.clientX - fe4) / ye4;
      let Re6 = 0.2 / (ye4 > 200 ? ye4 / 200 : 1);
      return Se4 < Re6 ? "start" : Se4 > 1 - Re6 ? "end" : "";
    },
    [n]
  ), I6 = A5(
    (r2, T4) => {
      const { clientX: Y4 } = T4, J6 = getID(r2), fe4 = n.getTask(J6), ye4 = T4.target.classList;
      if (!T4.target.closest(".wx-delete-button") && !e) {
        if (ye4.contains("wx-progress-marker")) {
          const { progress: Se4 } = n.getTask(J6);
          N3.current = {
            id: J6,
            x: Y4,
            progress: Se4,
            dx: 0,
            node: r2,
            marker: T4.target
          }, T4.target.classList.add("wx-progress-in-drag");
        } else {
          const Se4 = de5(r2, T4, fe4) || "move", Re6 = {
            id: J6,
            mode: Se4,
            x: Y4,
            dx: 0,
            l: fe4.$x,
            w: fe4.$w
          };
          if (ee5 && fe4.segments?.length) {
            const He3 = locate2(T4, "data-segment");
            He3 && (Re6.segmentIndex = He3.dataset.segment * 1, Js(fe4, Re6));
          }
          F5(Re6);
        }
        se5();
      }
    },
    [n, e, de5, se5, ee5]
  ), Te3 = A5(
    (r2) => {
      if (r2.button !== 0) return;
      const T4 = locate2(r2);
      T4 && I6(T4, r2);
    },
    [I6]
  ), ve3 = A5(
    (r2) => {
      const T4 = locate2(r2);
      T4 && (ae4.current = setTimeout(() => {
        le4(true), I6(T4, r2.touches[0]);
      }, 300));
    },
    [I6]
  ), xe5 = A5((r2) => {
    d(r2);
  }, []), me3 = A5(() => {
    if (N3.current) {
      const { dx: r2, id: T4, marker: Y4, value: J6 } = N3.current;
      N3.current = null, typeof J6 < "u" && r2 && n.exec("update-task", {
        id: T4,
        task: { progress: J6 },
        inProgress: false
      }), Y4.classList.remove("wx-progress-in-drag"), X6.current = true, we3();
    } else if (K4) {
      const { id: r2, mode: T4, dx: Y4, l: J6, w: fe4, start: ye4, segment: Se4, index: Re6 } = K4;
      if (F5(null), ye4) {
        const He3 = Math.round(Y4 / q4);
        if (!He3)
          n.exec("drag-task", {
            id: r2,
            width: fe4,
            left: J6,
            inProgress: false,
            ...Se4 && { segmentIndex: Re6 }
          });
        else {
          let Ue3 = {}, Oe2 = n.getTask(r2);
          Se4 && (Oe2 = Oe2.segments[Re6]), T4 === "move" ? (Ue3.start = Oe2.start, Ue3.end = Oe2.end) : Ue3[T4] = Oe2[T4], n.exec("update-task", {
            id: r2,
            diff: He3,
            task: Ue3,
            ...Se4 && { segmentIndex: Re6 }
          });
        }
        X6.current = true;
      }
      we3();
    }
  }, [n, we3, K4, q4]), ge4 = A5(
    (r2, T4) => {
      const { clientX: Y4 } = T4;
      if (!e)
        if (N3.current) {
          const { node: J6, x: fe4, id: ye4 } = N3.current, Se4 = N3.current.dx = Y4 - fe4, Re6 = Math.round(Se4 / J6.offsetWidth * 100);
          let He3 = N3.current.progress + Re6;
          N3.current.value = He3 = Math.min(
            Math.max(0, He3),
            100
          ), n.exec("update-task", {
            id: ye4,
            task: { progress: He3 },
            inProgress: true
          });
        } else if (K4) {
          xe5(null);
          const { mode: J6, l: fe4, w: ye4, x: Se4, id: Re6, start: He3, segment: Ue3, index: Oe2 } = K4, ot3 = n.getTask(Re6), We2 = Y4 - Se4, ft3 = Math.round(q4) || 1;
          if (!He3 && Math.abs(We2) < 20 || J6 === "start" && ye4 - We2 < ft3 || J6 === "end" && ye4 + We2 < ft3 || J6 === "move" && (We2 < 0 && fe4 + We2 < 0 || We2 > 0 && fe4 + ye4 + We2 > re3) || K4.segment && !Vs(ot3, K4))
            return;
          const ct2 = { ...K4, dx: We2 };
          let Ze3, Je2;
          if (J6 === "start" ? (Ze3 = fe4 + We2, Je2 = ye4 - We2) : J6 === "end" ? (Ze3 = fe4, Je2 = ye4 + We2) : J6 === "move" && (Ze3 = fe4 + We2, Je2 = ye4), n.exec("drag-task", {
            id: Re6,
            width: Je2,
            left: Ze3,
            inProgress: true,
            start: He3,
            ...Ue3 && { segmentIndex: Oe2 }
          }), !ct2.start && (J6 === "move" && ot3.$x === fe4 || J6 !== "move" && ot3.$w === ye4)) {
            X6.current = true, me3();
            return;
          }
          ct2.start = true, F5(ct2);
        } else {
          const J6 = locate2(r2);
          if (J6) {
            const fe4 = n.getTask(getID(J6)), Se4 = locate2(r2, "data-segment") || J6, Re6 = de5(Se4, T4, fe4);
            Se4.style.cursor = Re6 && !e ? "col-resize" : "pointer";
          }
        }
    },
    [
      n,
      e,
      K4,
      q4,
      re3,
      de5,
      xe5,
      me3
    ]
  ), ke3 = A5(
    (r2) => {
      ge4(r2, r2);
    },
    [ge4]
  ), pe4 = A5(
    (r2) => {
      U5 ? (r2.preventDefault(), ge4(r2, r2.touches[0])) : ae4.current && (clearTimeout(ae4.current), ae4.current = null);
    },
    [U5, ge4]
  ), he5 = A5(() => {
    me3();
  }, [me3]), Ce4 = A5(() => {
    le4(null), ae4.current && (clearTimeout(ae4.current), ae4.current = null), me3();
  }, [me3]);
  ie5(() => (window.addEventListener("mouseup", he5), () => {
    window.removeEventListener("mouseup", he5);
  }), [he5]);
  const Ee4 = A5(
    (r2) => {
      if (!e) {
        const T4 = locateID(r2.target);
        if (T4 && !r2.target.classList.contains("wx-link")) {
          const Y4 = locateID(r2.target, "data-segment");
          n.exec("show-editor", {
            id: T4,
            ...Y4 !== null && { segmentIndex: Y4 }
          });
        }
      }
    },
    [n, e]
  ), ze3 = ["e2s", "s2s", "e2e", "s2e"], $e2 = A5((r2, T4) => ze3[(r2 ? 1 : 0) + (T4 ? 0 : 2)], []), Me4 = A5(
    (r2, T4) => {
      const Y4 = E4.id, J6 = E4.start;
      return r2 === Y4 ? true : !!g.find((fe4) => fe4.target === r2 && fe4.source === Y4 && fe4.type === $e2(J6, T4));
    },
    [E4, f, $e2]
  ), Ae4 = A5(() => {
    E4 && B4(null);
  }, [E4]), Ne3 = A5(
    (r2) => {
      if (X6.current) {
        X6.current = false;
        return;
      }
      const T4 = locateID(r2.target);
      if (T4) {
        const Y4 = r2.target.classList;
        if (Y4.contains("wx-link")) {
          const J6 = Y4.contains("wx-left");
          if (!E4) {
            B4({ id: T4, start: J6 });
            return;
          }
          E4.id !== T4 && !Me4(T4, J6) && n.exec("add-link", {
            link: {
              source: E4.id,
              target: T4,
              type: $e2(E4.start, J6)
            }
          });
        } else if (Y4.contains("wx-delete-button-icon"))
          n.exec("delete-link", { id: D4 }), d(null);
        else {
          const J6 = locateID(r2.target, "data-segment");
          n.exec("select-task", {
            id: T4,
            toggle: r2.ctrlKey || r2.metaKey,
            range: r2.shiftKey,
            ...J6 !== null && { segmentIndex: J6 }
          });
        }
      }
      Ae4();
    },
    [
      n,
      E4,
      f,
      M2,
      Me4,
      $e2,
      Ae4
    ]
  ), b4 = A5((r2) => ({
    left: `${r2.$x}px`,
    top: `${r2.$y}px`,
    width: `${r2.$w}px`,
    height: `${r2.$h}px`,
    lineHeight: `${r2.$h}px`
  }), []), W5 = A5((r2) => ({
    left: `${r2.$x_base}px`,
    top: `${r2.$y_base}px`,
    width: `${r2.$w_base}px`,
    height: `${r2.$h_base}px`
  }), []), oe3 = A5((r2) => ({
    left: `${r2.$x_slack}px`,
    top: `${r2.$y}px`,
    width: `${Math.max(r2.$w_slack, 0)}px`,
    height: `${r2.$h}px`
  }), []), m = A5(
    (r2) => {
      if (U5 || ae4.current)
        return r2.preventDefault(), false;
    },
    [U5]
  ), c = x2(
    () => w.map((r2) => r2.id),
    [w]
  ), h = A5(
    (r2) => {
      let T4 = c.includes(r2) ? r2 : "task";
      return ["task", "milestone", "summary"].includes(r2) || (T4 = `task ${T4}`), T4;
    },
    [c]
  ), _4 = A5(
    (r2) => {
      n.exec(r2.action, r2.data);
    },
    [n]
  ), C4 = A5(
    (r2) => R4 && r2.critical,
    [R4]
  ), y4 = A5(
    (r2) => {
      if (ne6?.auto) {
        const T4 = Q5.getSummaryId(r2, true), Y4 = Q5.getSummaryId(E4.id, true);
        return E4?.id && !(Array.isArray(T4) ? T4 : [T4]).includes(
          E4.id
        ) && !(Array.isArray(Y4) ? Y4 : [Y4]).includes(r2);
      }
      return E4;
    },
    [ne6, Q5, E4]
  );
  return /* @__PURE__ */ ue4(
    "div",
    {
      className: "wx-GKbcLEGA wx-bars",
      ref: Z3,
      onContextMenu: m,
      onMouseDown: Te3,
      onMouseMove: ke3,
      onTouchStart: ve3,
      onTouchMove: pe4,
      onTouchEnd: Ce4,
      onClick: Ne3,
      onDoubleClick: Ee4,
      onDragStart: (r2) => (r2.preventDefault(), false),
      children: [
        O5 ? $2.map(
          (r2) => r2.$visibleSlack ? /* @__PURE__ */ a2(
            "div",
            {
              className: `wx-GKbcLEGA wx-slack wx-slack-${r2.type}`,
              style: oe3(r2)
            },
            r2.id
          ) : null
        ) : null,
        /* @__PURE__ */ a2(
          _n3,
          {
            onSelectLink: xe5,
            selectedLink: M2,
            readonly: e
          }
        ),
        $2.map((r2) => {
          if (r2.$skip && r2.$skip_baseline && !(S4 && v?.[r2.id])) return null;
          const T4 = `wx-bar wx-${h(r2.type)}` + (U5 && K4 && r2.id === K4.id ? " wx-touch" : "") + (E4 && E4.id === r2.id ? " wx-selected" : "") + (C4(r2) ? " wx-critical" : "") + (r2.$reorder ? " wx-reorder-task" : "") + (ee5 && r2.segments ? " wx-split" : ""), Y4 = "wx-link wx-left" + (E4 ? " wx-visible" : "") + (!E4 || !Me4(r2.id, true) && y4(r2.id) ? " wx-target" : "") + (E4 && E4.id === r2.id && E4.start ? " wx-selected" : "") + (C4(r2) ? " wx-critical" : ""), J6 = "wx-link wx-right" + (E4 ? " wx-visible" : "") + (!E4 || !Me4(r2.id, false) && y4(r2.id) ? " wx-target" : "") + (E4 && E4.id === r2.id && !E4.start ? " wx-selected" : "") + (C4(r2) ? " wx-critical" : "");
          return /* @__PURE__ */ ue4($t3, { children: [
            !r2.$skip && /* @__PURE__ */ ue4(
              "div",
              {
                className: "wx-GKbcLEGA " + T4,
                style: b4(r2),
                "data-id": setID(r2.id),
                "data-task-id": setID(r2.id),
                tabIndex: P4 === r2.id ? 0 : -1,
                children: [
                  !e && !te4 ? r2.id === M2?.target && M2?.type[2] === "s" ? /* @__PURE__ */ a2(
                    le,
                    {
                      type: "danger",
                      css: "wx-left wx-delete-button wx-delete-link",
                      children: /* @__PURE__ */ a2("i", { className: "wxi-close wx-delete-button-icon" })
                    }
                  ) : /* @__PURE__ */ a2("div", { className: "wx-GKbcLEGA " + Y4, children: /* @__PURE__ */ a2("div", { className: "wx-GKbcLEGA wx-inner" }) }) : null,
                  r2.type !== "milestone" ? /* @__PURE__ */ ue4(Pe2, { children: [
                    r2.progress && !(ee5 && r2.segments) ? /* @__PURE__ */ a2("div", { className: "wx-GKbcLEGA wx-progress-wrapper", children: /* @__PURE__ */ a2(
                      "div",
                      {
                        className: "wx-GKbcLEGA wx-progress-percent",
                        style: { width: `${r2.progress}%` }
                      }
                    ) }) : null,
                    !e && !(ee5 && r2.segments) && !(r2.type === "summary" && G3?.autoProgress) ? /* @__PURE__ */ a2(
                      "div",
                      {
                        className: "wx-GKbcLEGA wx-progress-marker",
                        style: { left: `calc(${r2.progress}% - 10px)` },
                        children: r2.progress
                      }
                    ) : null,
                    s ? /* @__PURE__ */ a2(s, { data: r2, api: n, onAction: _4 }) : ee5 && r2.segments ? /* @__PURE__ */ a2(Gn3, { task: r2, type: h(r2.type) }) : /* @__PURE__ */ a2("div", { className: "wx-GKbcLEGA wx-content", children: r2.text || "" })
                  ] }) : /* @__PURE__ */ ue4(Pe2, { children: [
                    /* @__PURE__ */ a2("div", { className: "wx-GKbcLEGA wx-content" }),
                    s ? /* @__PURE__ */ a2(s, { data: r2, api: n, onAction: _4 }) : /* @__PURE__ */ a2("div", { className: "wx-GKbcLEGA wx-text-out", children: r2.text })
                  ] }),
                  !e && !te4 ? r2.id === M2?.target && M2?.type[2] === "e" ? /* @__PURE__ */ a2(
                    le,
                    {
                      type: "danger",
                      css: "wx-right wx-delete-button wx-delete-link",
                      children: /* @__PURE__ */ a2("i", { className: "wxi-close wx-delete-button-icon" })
                    }
                  ) : /* @__PURE__ */ a2("div", { className: "wx-GKbcLEGA " + J6, children: /* @__PURE__ */ a2("div", { className: "wx-GKbcLEGA wx-inner" }) }) : null
                ]
              }
            ),
            S4 && v?.[r2.id] ? v[r2.id].map((fe4, ye4) => /* @__PURE__ */ a2(Pn3, { rollup: fe4, parent: r2 }, ye4)) : null,
            H3 && !r2.$skip_baseline ? /* @__PURE__ */ a2(
              "div",
              {
                className: "wx-GKbcLEGA wx-baseline" + (r2.type === "milestone" ? " wx-milestone" : ""),
                style: W5(r2)
              }
            ) : null
          ] }, r2.id);
        })
      ]
    }
  );
}
function Bn3(t2, e, s) {
  const n = t2.cells;
  let o = 0, l = n.length, g = 0;
  for (let u = 0; u < n.length; u++) {
    if (g + n[u].width > e) {
      l = u, o = g;
      break;
    }
    g += n[u].width;
  }
  let f = l;
  for (; f < n.length && g < s; )
    g += n[f].width, f++;
  return { from: o, slice: n.slice(l, f) };
}
function Gt2(t2) {
  const { api: e } = t2, s = useStore(e, "_scales"), n = useStore(e, "xArea"), o = useStore(e, "highlightTime"), l = x2(() => {
    const g = s.rows, f = g.length - 1;
    return g.map((u, i3) => i3 === f ? {
      height: u.height,
      from: n.from,
      slice: u.cells.slice(n.start, n.end)
    } : {
      height: u.height,
      ...Bn3(u, n.from, n.to)
    });
  }, [s, n]);
  return /* @__PURE__ */ a2("div", { className: "wx-ZkvhDKir wx-scale", style: { width: s.width }, children: l.map((g, f) => /* @__PURE__ */ a2(
    "div",
    {
      className: "wx-ZkvhDKir wx-row",
      style: { height: `${g.height}px`, paddingLeft: `${g.from}px` },
      children: g.slice.map((u, i3) => {
        const w = o ? o(u.date, u.unit) : "", H3 = "wx-cell " + (u.css || "") + " " + (w || "");
        return /* @__PURE__ */ a2(
          "div",
          {
            className: "wx-ZkvhDKir " + H3,
            style: { width: `${u.width}px` },
            children: /* @__PURE__ */ a2(
              "span",
              {
                className: "wx-ZkvhDKir" + (u.width > 100 ? " wx-cell-value" : ""),
                children: u.value
              }
            )
          },
          i3
        );
      })
    },
    f
  )) });
}
var Tt3 = 3e-3;
function Fn3(t2, e, s) {
  return Math.max(Math.min(t2, s), e);
}
function Pt3(t2, e, s) {
  let n = false, o = performance.now();
  function l(g) {
    const u = Math.abs(g) < 50 ? 4e-3 : 0.01, i3 = performance.now(), w = Math.min(i3 - o, 50);
    o = i3;
    const H3 = Fn3(
      -g * u,
      -Tt3 * w,
      Tt3 * w
    );
    return Math.exp(H3);
  }
  return function(f) {
    if (e() && (f.ctrlKey || f.metaKey)) {
      f.preventDefault();
      const u = l(f.deltaY), i3 = f.clientX - s().getBoundingClientRect().left;
      n || (n = true, requestAnimationFrame(() => {
        t2.exec("zoom-scale", {
          dir: u > 1 ? 1 : -1,
          ratio: Math.abs(1 - u),
          offset: i3
        }), n = false;
      }));
    }
  };
}
var On3 = /* @__PURE__ */ new Map();
function Kn3(t2) {
  const e = V6(null), s = V6(0), n = V6(null), o = typeof window < "u" && window.__RENDER_METRICS_ENABLED__;
  e.current === null && (e.current = performance.now()), s.current++, ie5(() => {
    if (o)
      return cancelAnimationFrame(n.current), n.current = requestAnimationFrame(() => {
        const l = {
          label: t2,
          time: performance.now() - e.current,
          renders: s.current,
          timestamp: Date.now()
        };
        On3.set(t2, l), window.dispatchEvent(
          new CustomEvent("render-metric", { detail: l })
        );
      }), () => cancelAnimationFrame(n.current);
  });
}
function Un3(t2) {
  const { readonly: e, fullWidth: s, fullHeight: n, taskTemplate: o } = t2, l = be4(Be3), [g, f] = useStoreWithCounter(l, "_selected"), u = useStore(l, "scrollTop"), i3 = useStore(l, "scrollLeft"), w = useStore(l, "cellHeight"), H3 = useStore(l, "_tasks"), L5 = useStore(l, "resources"), S4 = useStore(l, "_scales"), v = useStore(l, "area"), z4 = useStore(l, "groupBy"), R4 = useStore(l, "xArea"), Q5 = useStore(l, "zoom"), ne6 = useStore(l, "_calendars"), ee5 = useStore(l, "_markers"), G3 = useStore(l, "highlightTime"), [O5, $2] = ce5(), q4 = V6(null), te4 = V6({ top: null, left: null }), X6 = V6(false), E4 = 1, B4 = x2(() => {
    const k2 = [];
    return g && g.length && w && g.forEach((P4) => {
      k2.push({ height: `${w}px`, top: `${P4.$y - 3}px` });
    }), k2;
  }, [f, w]), K4 = x2(
    () => Math.max(O5 || 0, n),
    [O5, n]
  );
  at2(() => {
    const k2 = q4.current;
    if (k2) {
      if (X6.current) {
        X6.current = false;
        return;
      }
      typeof u == "number" && (te4.current.top = u, k2.scrollTop = u), typeof i3 == "number" && (te4.current.left = i3, k2.scrollLeft = i3);
    }
  }, [u, i3]);
  const F5 = () => {
    const k2 = q4.current;
    k2 && k2.scrollLeft !== te4.current.left && (te4.current.left = k2.scrollLeft, X6.current = true, l.exec("scroll-chart", { left: k2.scrollLeft }));
  };
  function N3() {
    const P4 = Math.ceil((O5 || 0) / (w || 1)) + 1, se5 = Math.floor((u || 0) / (w || 1)), we3 = Math.max(0, se5 - E4), de5 = se5 + P4 + E4, I6 = we3 * (w || 0);
    l.exec("render-data", {
      start: we3,
      end: de5,
      from: I6
    });
  }
  ie5(() => {
    N3();
  }, [u, O5, w]);
  const D4 = V6(Q5);
  D4.current = Q5;
  const d = x2(
    () => Pt3(
      l,
      () => D4.current,
      () => q4.current
    ),
    [l]
  );
  function M2(k2) {
    const P4 = G3?.(k2.date, k2.unit);
    return P4 ? {
      css: P4,
      width: k2.width
    } : null;
  }
  const U5 = x2(() => G3 ? S4.rows[S4.rows.length - 1].cells.slice(R4.start, R4.end).map(M2) : null, [S4, G3, R4]), le4 = x2(() => {
    const P4 = S4.rows[S4.rows.length - 1]?.cells;
    return (S4.minUnit === "hour" || S4.minUnit === "day") && P4 ? P4.slice(R4.start, R4.end) : [];
  }, [S4, R4]), ae4 = x2(
    () => H3.slice(v.start, v.end),
    [H3, v]
  );
  function re3(k2) {
    if (z4?.field === "resource") {
      if (k2.$resource) {
        const de5 = l.getResourceCalendar(k2);
        return de5 ? [de5] : [];
      }
      const se5 = k2.$groupValue;
      return se5 === void 0 || se5 === "$ungrouped" ? [] : (Array.isArray(se5) ? se5 : [se5]).flatMap((de5) => {
        const I6 = L5?.byId(de5);
        if (!I6) return [];
        const Te3 = l.getResourceCalendar(I6);
        return Te3 ? [Te3] : [];
      });
    }
    const P4 = k2.calendar ? l.getTaskCalendar(k2) : void 0;
    return P4 ? [P4] : [];
  }
  const j4 = x2(() => {
    const k2 = [];
    if (!ne6) return k2;
    const P4 = l.getCalendar();
    return ae4.forEach((se5, we3) => {
      const de5 = re3(se5);
      de5.length && le4.forEach((I6, Te3) => {
        const ve3 = de5.filter(
          (pe4) => !pe4.isWorkingDay(I6.date)
        ), xe5 = ve3.length === 0, me3 = P4 && !P4.isWorkingDay(I6.date), ge4 = {
          width: I6.width,
          height: w,
          left: (Te3 + R4.start) * I6.width,
          top: v.from + we3 * w
        };
        let ke3 = "";
        xe5 || (ke3 = ["wx-weekend", ...ve3.map((he5) => he5.css).filter(Boolean)].join(" ")), xe5 && me3 && (ke3 = "wx-weekend-override"), ke3 && k2.push({ ...ge4, css: ke3 });
      });
    }), k2;
  }, [
    ne6,
    ae4,
    le4,
    w,
    R4,
    v,
    z4,
    L5,
    l
  ]), Z3 = A5(
    (k2) => {
      k2.eventSource = "chart", l.exec("hotkey", k2);
    },
    [l]
  );
  return ie5(() => {
    const k2 = q4.current;
    if (!k2) return;
    const P4 = () => $2(k2.clientHeight);
    P4();
    const se5 = new ResizeObserver(() => P4());
    return se5.observe(k2), () => {
      se5.disconnect();
    };
  }, [q4.current]), ie5(() => {
    const k2 = q4.current;
    if (!k2) return;
    const P4 = Ie3(k2, {
      keys: {
        arrowup: true,
        arrowdown: true
      },
      exec: (se5) => Z3(se5)
    });
    return () => {
      P4?.destroy();
    };
  }, []), ie5(() => {
    const k2 = q4.current;
    if (!k2) return;
    const P4 = d;
    return k2.addEventListener("wheel", P4), () => {
      k2.removeEventListener("wheel", P4);
    };
  }, [d]), Kn3("chart"), /* @__PURE__ */ ue4(
    "div",
    {
      className: "wx-mR7v2Xag wx-chart",
      tabIndex: -1,
      ref: q4,
      onScroll: F5,
      children: [
        /* @__PURE__ */ a2(Gt2, { api: l }),
        ee5 && ee5.length ? /* @__PURE__ */ a2(
          "div",
          {
            className: "wx-mR7v2Xag wx-markers",
            style: { height: `${K4}px` },
            children: ee5.map((k2, P4) => /* @__PURE__ */ a2(
              "div",
              {
                className: `wx-mR7v2Xag wx-marker ${k2.css || ""}`,
                style: { left: `${k2.left}px` },
                children: /* @__PURE__ */ a2("div", { className: "wx-mR7v2Xag wx-content", children: k2.text })
              },
              P4
            ))
          }
        ) : null,
        /* @__PURE__ */ ue4(
          "div",
          {
            className: "wx-mR7v2Xag wx-area",
            style: { width: `${s}px`, height: `${K4}px` },
            children: [
              U5 ? /* @__PURE__ */ a2(
                "div",
                {
                  className: "wx-mR7v2Xag wx-gantt-holidays",
                  style: { height: "100%" },
                  children: U5.map(
                    (k2, P4) => k2 ? /* @__PURE__ */ a2(
                      "div",
                      {
                        className: "wx-mR7v2Xag " + k2.css,
                        style: {
                          width: `${k2.width}px`,
                          left: `${R4.from + P4 * k2.width}px`
                        }
                      },
                      P4
                    ) : null
                  )
                }
              ) : null,
              j4.map((k2, P4) => /* @__PURE__ */ a2(
                "div",
                {
                  className: "wx-mR7v2Xag " + k2.css,
                  style: {
                    position: "absolute",
                    pointerEvents: "none",
                    width: `${k2.width}px`,
                    height: `${k2.height}px`,
                    left: `${k2.left}px`,
                    top: `${k2.top}px`
                  }
                },
                P4
              )),
              g && g.length ? g.map(
                (k2, P4) => k2.$y ? /* @__PURE__ */ a2(
                  "div",
                  {
                    className: "wx-mR7v2Xag wx-selected",
                    "data-id": setID(k2.id),
                    style: B4[P4]
                  },
                  k2.id
                ) : null
              ) : null,
              /* @__PURE__ */ a2(In3, {}),
              /* @__PURE__ */ a2(Vn3, { readonly: e, taskTemplate: o })
            ]
          }
        )
      ]
    }
  );
}
function Vt4(t2) {
  const {
    api: e,
    position: s = "after",
    size: n = 4,
    dir: o = "x",
    onMove: l,
    containerWidth: g = 0,
    rightThreshold: f = 50
  } = t2, u = useStore(e, "gridWidth"), i3 = useStore(e, "displayMode"), w = useStore(e, "_gridCollapseThreshold"), H3 = useStore(e, "_compactMode");
  function L5(N3) {
    let D4 = 0;
    s === "center" ? D4 = n / 2 : s === "before" && (D4 = n);
    const d = {
      size: [n + "px", "auto"],
      p: [N3 - D4 + "px", "0px"],
      p2: ["auto", "0px"]
    };
    if (o !== "x")
      for (let M2 in d) d[M2] = d[M2].reverse();
    return d;
  }
  const S4 = V6(0), v = V6(), z4 = V6(), R4 = V6(u);
  R4.current = u;
  const Q5 = V6(i3);
  Q5.current = i3;
  const ne6 = V6(H3);
  ne6.current = H3;
  const ee5 = V6(w);
  ee5.current = w;
  function G3(N3) {
    return o === "x" ? N3.clientX : N3.clientY;
  }
  const O5 = x2(
    () => i3 !== "all" ? "auto" : o === "x" ? "ew-resize" : "ns-resize",
    [i3, o]
  ), $2 = A5(
    (N3) => {
      const D4 = v.current + G3(N3) - S4.current;
      e.exec("resize-grid", {
        width: D4
      });
      let d;
      D4 <= ee5.current ? d = "chart" : g - D4 <= f ? d = "grid" : d = "all", Q5.current !== d && e.exec("set-display-mode", {
        mode: d
      }), z4.current && clearTimeout(z4.current), z4.current = setTimeout(
        () => l && l(D4),
        100
      );
    },
    [e, g, f, l, o]
  ), q4 = A5(() => {
    document.body.style.cursor = "", document.body.style.userSelect = "", window.removeEventListener("mousemove", $2), window.removeEventListener("mouseup", q4);
  }, [$2]), te4 = A5(
    (N3) => {
      ne6.current || Q5.current === "grid" || Q5.current === "chart" || (S4.current = G3(N3), v.current = R4.current, document.body.style.cursor = O5, document.body.style.userSelect = "none", window.addEventListener("mousemove", $2), window.addEventListener("mouseup", q4));
    },
    [O5, $2, q4, o]
  );
  function X6(N3) {
    let D4;
    H3 ? D4 = i3 === "chart" ? "grid" : "chart" : i3 === "grid" || i3 === "chart" ? D4 = "all" : D4 = N3 === "left" ? "chart" : "grid", e.exec("set-display-mode", { mode: D4 });
  }
  function E4() {
    X6("left");
  }
  function B4() {
    X6("right");
  }
  const K4 = x2(
    () => L5(u),
    [u, s, n, o]
  ), F5 = [
    "wx-resizer",
    `wx-resizer-${o}`,
    `wx-resizer-display-${i3}`
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ ue4(
    "div",
    {
      className: "wx-pFykzMlT " + F5,
      onMouseDown: te4,
      style: { width: K4.size[0], height: K4.size[1], cursor: O5 },
      children: [
        /* @__PURE__ */ ue4("div", { className: "wx-pFykzMlT wx-button-expand-box", children: [
          /* @__PURE__ */ a2("div", { className: "wx-pFykzMlT wx-button-expand-content wx-button-expand-left", children: /* @__PURE__ */ a2(
            "i",
            {
              className: "wx-pFykzMlT wxi-menu-left",
              onClick: E4
            }
          ) }),
          /* @__PURE__ */ a2("div", { className: "wx-pFykzMlT wx-button-expand-content wx-button-expand-right", children: /* @__PURE__ */ a2(
            "i",
            {
              className: "wx-pFykzMlT wxi-menu-right",
              onClick: B4
            }
          ) })
        ] }),
        /* @__PURE__ */ a2("div", { className: "wx-pFykzMlT wx-resizer-line" })
      ]
    }
  );
}
function jn3(t2) {
  const { taskTemplate: e, readonly: s, onTableAPIChange: n, onGanttWidthChange: o } = t2, l = be4(Be3), g = useStore(l, "_tasks"), f = useStore(l, "_scales"), u = useStore(l, "cellHeight"), i3 = useStore(l, "columns"), w = useStore(l, "scrollTop"), H3 = useStore(l, "undo"), L5 = useStore(l, "_columnsWidth"), [S4, v] = useWritableProp2(t2.ganttWidth), [z4, R4] = ce5(0), [Q5, ne6] = ce5(void 0), ee5 = x2(
    () => (S4 ?? 0) - (Q5 ?? 0),
    [S4, Q5]
  ), G3 = x2(() => f.width, [f]), O5 = x2(
    () => g.length * u,
    [g, u]
  ), $2 = x2(
    () => f.height + O5 + ee5,
    [f, O5, ee5]
  ), q4 = V6(null), te4 = V6({
    ganttWidth: 0,
    columnsWidth: 0,
    ganttHeight: 0,
    rScalesHeight: 0,
    scrollSize: 0
  });
  ie5(() => {
    te4.current = {
      ganttWidth: S4 ?? 0,
      columnsWidth: L5,
      ganttHeight: z4 ?? 0,
      rScalesHeight: f.height,
      scrollSize: ee5
    };
  }, [S4, L5, z4, f, ee5]);
  const X6 = A5(() => {
    const {
      ganttWidth: d,
      columnsWidth: M2,
      ganttHeight: U5,
      rScalesHeight: le4,
      scrollSize: ae4
    } = te4.current;
    l.exec("resize-chart", {
      width: d - M2 - ae4 - 4,
      // resizer width
      height: U5 - le4,
      scrollSize: ae4
    });
  }, [l]);
  ie5(() => {
    let d;
    return q4.current && (d = new ResizeObserver(X6), d.observe(q4.current)), () => {
      d && d.disconnect();
    };
  }, [q4.current, X6]);
  const E4 = V6(null), B4 = V6(null), K4 = V6(null), F5 = V6(false), N3 = A5(() => {
    const d = E4.current;
    d && d.scrollTop !== K4.current && (K4.current = d.scrollTop, F5.current = true, l.exec("scroll-chart", {
      top: d.scrollTop
    }));
  }, [l]);
  ie5(() => {
    const d = E4.current, M2 = B4.current;
    if (!d || !M2) return;
    const U5 = () => {
      kn3(() => {
        R4(d.offsetHeight), v(d.offsetWidth), ne6(M2.offsetWidth);
      });
    }, le4 = new ResizeObserver(U5);
    return le4.observe(d), () => le4.disconnect();
  }, [E4.current]), ie5(() => {
    o && o(S4);
  }, [S4, o]), ie5(() => {
    const d = E4.current;
    if (d) {
      if (F5.current) {
        F5.current = false;
        return;
      }
      w !== d.scrollTop && (K4.current = w, d.scrollTop = w);
    }
  }, [w]);
  const D4 = V6(null);
  return ie5(() => {
    const d = D4.current;
    if (!d) return;
    const M2 = Ie3(d, {
      keys: {
        "ctrl+c": true,
        "ctrl+v": true,
        "ctrl+x": true,
        "ctrl+d": true,
        backspace: true,
        "ctrl+z": H3,
        "ctrl+y": H3
      },
      exec: (U5) => {
        U5.isInput || l.exec("hotkey", U5);
      }
    });
    return () => {
      M2?.destroy();
    };
  }, [H3]), /* @__PURE__ */ a2("div", { className: "wx-jlbQoHOz wx-gantt", ref: E4, onScroll: N3, children: /* @__PURE__ */ a2(
    "div",
    {
      className: "wx-jlbQoHOz wx-pseudo-rows",
      style: { height: $2, width: "100%" },
      ref: B4,
      children: /* @__PURE__ */ a2(
        "div",
        {
          className: "wx-jlbQoHOz wx-stuck",
          style: {
            height: z4,
            width: Q5
          },
          children: /* @__PURE__ */ ue4("div", { tabIndex: 0, className: "wx-jlbQoHOz wx-layout", ref: D4, children: [
            i3.length ? /* @__PURE__ */ ue4(Pe2, { children: [
              /* @__PURE__ */ a2(
                Dn2,
                {
                  readonly: s,
                  fullHeight: O5,
                  onTableAPIChange: n
                }
              ),
              /* @__PURE__ */ a2(Vt4, { containerWidth: S4, api: l })
            ] }) : null,
            /* @__PURE__ */ a2("div", { className: "wx-jlbQoHOz wx-content", ref: q4, children: /* @__PURE__ */ a2(
              Un3,
              {
                readonly: s,
                fullWidth: G3,
                fullHeight: O5,
                taskTemplate: e
              }
            ) })
          ] })
        }
      )
    }
  ) });
}
function Xn3(t2) {
  return {
    year: "%Y",
    quarter: `${t2("Q")} %Q`,
    month: "%M",
    week: `${t2("Week")} %w`,
    day: "%M %j",
    hour: "%H:%i"
  };
}
function Yn3(t2, e) {
  return typeof t2 == "function" ? t2 : dateToString(t2, e);
}
function Bt3(t2, e) {
  return t2.map(({ format: s, ...n }) => ({
    ...n,
    format: Yn3(s, e)
  }));
}
function qn3(t2, e) {
  const s = Xn3(e);
  for (let n in s)
    s[n] = dateToString(s[n], t2);
  return s;
}
function Qn3(t2, e) {
  if (!t2 || !t2.length) return t2;
  const s = dateToString("%d-%m-%Y", e);
  return t2.map((n) => n.template ? n : n.id === "start" || n.id === "end" ? {
    ...n,
    //store locale template for unscheduled tasks
    _template: (o) => s(o),
    template: (o) => s(o)
  } : n.id === "duration" ? {
    ...n,
    _template: (o) => o,
    template: (o) => o
  } : n);
}
function Zn3(t2, e) {
  return t2.levels ? {
    ...t2,
    levels: t2.levels.map((s) => ({
      ...s,
      scales: Bt3(s.scales, e)
    }))
  } : t2;
}
var Jn3 = (t2) => t2.split("-").map((e) => e ? e.charAt(0).toUpperCase() + e.slice(1) : "").join("");
var es2 = [
  { unit: "month", step: 1, format: "%F %Y" },
  { unit: "day", step: 1, format: "%j" }
];
var je2 = [];
var ts2 = { type: "forward" };
var ns2 = { type: "closest" };
var ss2 = 650;
var Ns2 = Nt3(function({
  taskTemplate: e = null,
  markers: s = je2,
  taskTypes: n = Pt2,
  tasks: o = je2,
  selected: l = je2,
  activeTask: g = null,
  links: f = je2,
  resources: u = null,
  assignments: i3 = je2,
  scales: w = es2,
  columns: H3 = null,
  start: L5 = null,
  end: S4 = null,
  lengthUnit: v = "day",
  durationUnit: z4 = "day",
  cellWidth: R4 = 100,
  cellHeight: Q5 = 38,
  scaleHeight: ne6 = 36,
  gridWidth: ee5 = null,
  displayMode: G3 = "all",
  readonly: O5 = false,
  cellBorders: $2 = "full",
  zoom: q4 = false,
  baselines: te4 = false,
  rollups: X6 = false,
  highlightTime: E4 = null,
  init: B4 = null,
  autoScale: K4 = true,
  unscheduledTasks: F5 = false,
  criticalPath: N3 = null,
  schedule: D4 = ts2,
  projectStart: d = null,
  projectEnd: M2 = null,
  calendar: U5 = null,
  calendars: le4 = je2,
  undo: ae4 = false,
  splitTasks: re3 = false,
  summary: j4 = null,
  slack: Z3 = false,
  groupBy: k2 = null,
  wbs: P4 = false,
  ...se5
}, we3) {
  const de5 = V6();
  de5.current = se5;
  const I6 = x2(() => new fa(writable), []), Te3 = x2(() => ({ ...en_default, ...en_default2 }), []), ve3 = be4(Qt.i18n), xe5 = x2(() => ve3 ? ve3.extend(Te3, true) : locale(Te3), [ve3, Te3]), me3 = x2(() => xe5.getRaw().calendar, [xe5]), ge4 = x2(
    () => ia({ resources: !!u, wbs: P4 }),
    [u, P4]
  ), ke3 = x2(
    () => ee5 ?? oa(ge4),
    [ee5, ge4]
  ), pe4 = x2(() => {
    let h = {
      zoom: Zn3(q4, me3),
      scales: Bt3(w, me3),
      columns: Qn3(H3 ?? ge4, me3),
      links: f,
      cellWidth: R4
    };
    return h.zoom && (h = {
      ...h,
      ...Us(
        h.zoom,
        qn3(me3, xe5.getGroup("gantt")),
        h.scales,
        R4
      )
    }), h;
  }, [q4, w, H3, ge4, f, R4, me3, xe5]), he5 = x2(() => I6.in, [I6]), Ce4 = V6(null);
  Ce4.current === null && (Ce4.current = new EventBusRouter((h, _4) => {
    const C4 = "on" + Jn3(h);
    de5.current && de5.current[C4] && de5.current[C4](_4);
  }), he5.setNext(Ce4.current));
  const [Ee4, ze3] = ce5(null), $e2 = V6(null);
  $e2.current = Ee4;
  const [Me4, Ae4] = ce5(false), Ne3 = A5((h) => {
    const _4 = h != null && h <= ss2;
    Ae4((C4) => C4 === _4 ? C4 : _4);
  }, []), b4 = x2(
    () => ({
      getState: I6.getState.bind(I6),
      getReactiveState: I6.getReactive.bind(I6),
      getStores: () => ({ data: I6 }),
      exec: he5.exec,
      setNext: (h) => (Ce4.current = Ce4.current.setNext(h), Ce4.current),
      intercept: he5.intercept.bind(he5),
      on: he5.on.bind(he5),
      detach: he5.detach.bind(he5),
      getTask: (h) => I6.getTask(h),
      getResource: (h) => I6.getResource(h),
      serialize: (h) => I6.serialize(h),
      getTable: (h) => h ? new Promise((_4) => setTimeout(() => _4($e2.current), 1)) : $e2.current,
      getHistory: () => I6.getHistory(),
      getCalendar: (h) => I6.getCalendar(h),
      getTaskCalendar: (h) => I6.getTaskCalendar(h),
      getResourceCalendar: (h) => I6.getResourceCalendar(h),
      getTaskResources: (h) => I6.getTaskResources(h),
      getResourceTasks: (h) => I6.getResourceTasks(h)
    }),
    [I6, he5]
  ), W5 = x2(
    () => ({
      getReactiveState: I6.getReactive.bind(I6),
      getState: I6.getState.bind(I6),
      exec: he5.exec.bind(he5),
      getTask: I6.getTask.bind(I6),
      getTaskCalendar: I6.getTaskCalendar.bind(I6),
      getResourceCalendar: I6.getResourceCalendar.bind(I6),
      getCalendar: I6.getCalendar.bind(I6),
      getTaskResources: I6.getTaskResources.bind(I6),
      getHistory: I6.getHistory.bind(I6)
    }),
    [I6, he5]
  );
  Et2(
    we3,
    () => ({
      ...b4
    }),
    [b4]
  );
  const oe3 = x2(
    () => X6 === true ? ns2 : X6,
    [X6]
  ), m = x2(
    () => ({
      tasks: o,
      links: pe4.links,
      resources: u,
      assignments: i3,
      start: L5,
      columns: pe4.columns,
      end: S4,
      lengthUnit: v,
      cellWidth: pe4.cellWidth,
      cellHeight: Q5,
      scaleHeight: ne6,
      scales: pe4.scales,
      taskTypes: n,
      zoom: pe4.zoom,
      selected: l,
      activeTask: g,
      baselines: te4,
      rollups: oe3,
      autoScale: K4,
      unscheduledTasks: F5,
      markers: s,
      durationUnit: z4,
      criticalPath: N3,
      schedule: D4,
      projectStart: d,
      projectEnd: M2,
      calendar: U5,
      calendars: le4,
      slack: Z3,
      undo: ae4,
      _weekStart: me3.weekStart,
      splitTasks: re3,
      summary: j4,
      groupBy: k2,
      highlightTime: E4,
      wbs: P4,
      displayMode: G3,
      gridWidth: ke3,
      cellBorders: $2,
      _compactMode: Me4
    }),
    [
      o,
      pe4,
      u,
      i3,
      L5,
      S4,
      v,
      Q5,
      ne6,
      n,
      l,
      g,
      te4,
      oe3,
      K4,
      F5,
      s,
      z4,
      N3,
      D4,
      d,
      M2,
      U5,
      le4,
      Z3,
      ae4,
      me3,
      re3,
      j4,
      k2,
      E4,
      P4,
      G3,
      ke3,
      $2,
      Me4
    ]
  ), c = V6(0);
  return ie5(() => {
    c.current ? I6.init(m) : B4 && B4(b4), c.current++;
  }, [b4, B4, m, I6]), c.current === 0 && I6.init(m), /* @__PURE__ */ a2(Qt.i18n.Provider, { value: xe5, children: /* @__PURE__ */ a2(Be3.Provider, { value: W5, children: /* @__PURE__ */ a2(
    jn3,
    {
      taskTemplate: e,
      readonly: O5,
      onTableAPIChange: ze3,
      onGanttWidthChange: Ne3
    }
  ) }) });
});
function Ft3(t2) {
  return t2.map((e) => {
    const s = { ...e };
    return e.data && (s.data = Ft3(e.data)), s;
  });
}
var Ms2 = Nt3(function({
  options: e = [],
  api: s = null,
  resolver: n = null,
  filter: o = null,
  at: l = "point",
  children: g,
  onClick: f,
  css: u
}, i3) {
  const w = V6(null), H3 = V6(null), [L5, S4] = ce5(null), [v, z4] = ce5([]), R4 = be4(Qt.i18n), Q5 = x2(() => R4 || locale({ ...en_default2, ...en_default }), [R4]), ne6 = x2(() => Q5.getGroup("gantt"), [Q5]), ee5 = useStoreLater(s, "taskTypes"), G3 = useStoreLater(s, "selected"), O5 = useStoreLater(s, "_selected"), $2 = useStoreLater(s, "splitTasks"), q4 = useStoreLater(s, "summary"), te4 = useStoreLater(s, "groupBy"), X6 = x2(
    () => ({
      splitTasks: $2,
      taskTypes: ee5,
      summary: q4,
      group: !!te4?.field
    }),
    [$2, ee5, q4, te4]
  ), E4 = x2(() => ka(X6), [X6]), B4 = x2(
    () => e.length ? e : null,
    [e]
  ), K4 = x2(
    () => F5(B4 ?? E4),
    [B4, E4, ne6]
  );
  ie5(() => {
    s && (s.on("scroll-chart", () => {
      w.current && w.current.show && w.current.show();
    }), s.on("drag-task", () => {
      w.current && w.current.show && w.current.show();
    }));
  }, [s]);
  function F5(re3) {
    return re3.map((j4) => (j4 = { ...j4 }, j4.text && (j4.text = ne6(j4.text)), j4.subtext && (j4.subtext = ne6(j4.subtext)), j4.data && (j4.data = F5(j4.data)), j4));
  }
  const N3 = x2(
    () => O5 && O5.length ? O5 : L5 ? [L5] : [],
    [O5, L5]
  ), D4 = A5(
    (re3 = N3) => {
      if (!s) return [];
      const j4 = Ft3(K4), Z3 = (k2) => {
        k2.forEach((P4) => {
          P4.isDisabled && (P4.disabled = re3.some(
            (se5) => P4.isDisabled(
              se5,
              s.getState(),
              s.getTaskCalendar(se5),
              H3.current
            )
          )), P4.data && Z3(P4.data);
        });
      };
      return Z3(j4), j4;
    },
    [s, K4, N3]
  ), d = A5(
    (re3, j4) => {
      if (locate2(j4.target, "data-menu-ignore")?.classList.contains(
        "wx-resource-load"
      ))
        return null;
      let Z3 = re3 ? s?.getTask(re3) : null;
      if (n) {
        const k2 = n(re3, j4);
        Z3 = k2 === true ? Z3 : k2;
      }
      if (S4(Z3), Z3) {
        const k2 = locateID(j4.target, "data-segment");
        k2 !== null ? H3.current = { id: Z3.id, segmentIndex: k2 } : H3.current = Z3.id, (!Array.isArray(G3) || !G3.includes(Z3.id)) && s && s.exec && s.exec("select-task", { id: Z3.id });
        const P4 = O5 && O5.length ? O5 : [Z3];
        z4(D4(P4));
      }
      return Z3;
    },
    [s, n, G3, O5, D4]
  ), M2 = A5(
    (re3) => {
      const j4 = re3.action;
      j4 && (Ce2(E4, j4.id) && V2(s, j4.id, H3.current, ne6), f && f(re3));
    },
    [s, ne6, f, E4]
  ), U5 = A5(
    (re3) => {
      if (!s) return true;
      let j4 = o ? N3.every((Z3) => o(re3, Z3)) : true;
      return j4 && re3.isHidden && (j4 = !N3.some(
        (Z3) => re3.isHidden(Z3, s.getState(), H3.current)
      )), j4;
    },
    [o, N3, s]
  );
  Et2(i3, () => ({
    show: (re3, j4) => {
      z4(D4()), w.current && w.current.show && w.current.show(re3, j4);
    }
  }));
  const le4 = A5((re3) => {
    w.current && w.current.show && w.current.show(re3);
  }, []), ae4 = /* @__PURE__ */ ue4(Pe2, { children: [
    /* @__PURE__ */ a2(
      xe4,
      {
        filter: U5,
        options: v,
        dataKey: "id",
        resolver: d,
        onClick: M2,
        at: l,
        ref: w,
        css: u
      }
    ),
    /* @__PURE__ */ a2("span", { onContextMenu: le4, "data-menu-ignore": "true", children: typeof g == "function" ? g() : g })
  ] });
  if (!R4 && Qt.i18n?.Provider) {
    const re3 = Qt.i18n.Provider;
    return /* @__PURE__ */ a2(re3, { value: Q5, children: ae4 });
  }
  return ae4;
});
function dt2(t2) {
  const { columns: e, data: s, onAction: n, onEdit: o, sizes: l, onInit: g } = t2, f = V6(n), u = V6(o), i3 = V6(g);
  ie5(() => {
    f.current = n, u.current = o, i3.current = g;
  }, [n, o, g]);
  function w(L5) {
    const S4 = locateID(L5), v = L5.target.dataset.action;
    v && L5.preventDefault(), S4 && v && f.current?.(S4, v);
  }
  const H3 = A5((L5) => {
    i3.current?.(L5), L5.on("update-cell", (S4) => {
      const { id: v, column: z4, value: R4 } = S4;
      u.current?.(v, z4, R4);
    });
  }, []);
  return /* @__PURE__ */ a2("div", { className: "wx-table wx-aaadQkXy", onClick: w, children: /* @__PURE__ */ a2(
    bo,
    {
      init: H3,
      columns: e,
      data: s,
      select: false,
      columnStyle: (L5) => `wx-editor-cell wx-text-${L5.align} ${L5.id === "delete" ? "wx-action" : ""}`,
      sizes: l || {}
    }
  ) });
}
function Ct2(t2) {
  const { row: e, column: s, data: n } = t2, o = x2(() => n ? n.label : s.options.find((l) => l.id === e.type)?.label || "", [n, s, e]);
  return /* @__PURE__ */ ue4("div", { className: "wx-wrapper wx-aadwz4ed", children: [
    /* @__PURE__ */ a2("div", { className: "wx-text wx-aadwz4ed", children: o }),
    e && /* @__PURE__ */ a2("i", { className: "wxi-angle-down wx-aadwz4ed" })
  ] });
}
function rs2({
  api: t2,
  autoSave: e,
  onExtChange: s,
  predecessors: n = null,
  successors: o = null,
  batch: l = "links"
}) {
  const g = be4(Qt.i18n), f = x2(() => g.getGroup("gantt"), [g]), u = useStore(t2, "activeTask"), i3 = useStore(t2, "_activeTask"), [w, H3] = useStoreWithCounter(t2, "links"), L5 = useStore(t2, "tasks"), S4 = useStore(t2, "schedule"), v = useStore(t2, "unscheduledTasks"), z4 = x2(
    () => [
      { id: "e2s", label: f("End-to-start") },
      { id: "s2s", label: f("Start-to-start") },
      { id: "e2e", label: f("End-to-end") },
      { id: "s2e", label: f("Start-to-end") }
    ],
    [f]
  );
  function R4(B4) {
    return B4.type === "e2s" ? { type: "text", config: { type: "number" } } : null;
  }
  const Q5 = x2(
    () => !S4?.auto || v && i3?.unscheduled,
    [S4, v, i3]
  );
  function ne6() {
    return [
      {
        id: "taskText",
        header: f("Task name"),
        flexgrow: 2
      },
      {
        id: "lag",
        header: f("Lag"),
        editor: R4,
        flexgrow: 1,
        hidden: Q5
      },
      {
        id: "type",
        header: f("Type"),
        width: 124,
        options: z4,
        editor: {
          type: "richselect",
          config: {
            cell: Ct2
          }
        },
        cell: Ct2
      },
      {
        id: "delete",
        header: "",
        cell: Xe3,
        width: 50,
        align: "center"
      }
    ];
  }
  function ee5() {
    if (u) {
      const B4 = [], K4 = [];
      (!n || !o) && w.forEach((D4) => {
        !n && D4.target === u && B4.push(D4), !o && D4.source === u && K4.push(D4);
      });
      const F5 = n || B4.map((D4) => {
        const { id: d, lag: M2, type: U5, source: le4 } = D4;
        return {
          id: d,
          type: U5,
          lag: M2,
          taskText: L5.byId(le4).text
        };
      }), N3 = o || K4.map((D4) => {
        const { id: d, lag: M2, type: U5, target: le4 } = D4;
        return {
          id: d,
          type: U5,
          lag: M2,
          taskText: L5.byId(le4).text
        };
      });
      return [
        { title: f("Predecessors"), data: F5 },
        { title: f("Successors"), data: N3 }
      ];
    }
  }
  const [G3, O5] = ce5();
  ie5(() => {
    O5(ee5());
  }, [u, w, H3, L5, n, o]);
  function $2(B4) {
    e ? t2.exec("delete-link", { id: B4 }) : O5((K4) => {
      const F5 = (K4 || []).map((N3) => ({
        ...N3,
        data: N3.data.filter((D4) => D4.id !== B4)
      }));
      return s && s({
        view: "links",
        event: {
          id: B4,
          action: "delete-link",
          data: { id: B4 }
        },
        values: {
          predecessors: F5[0].data,
          successors: F5[1].data
        }
      }), F5;
    });
  }
  function q4(B4, K4, F5) {
    const N3 = { [K4]: F5 };
    K4 === "type" && S4?.auto && F5 !== "e2s" && (N3.lag = ""), e ? t2.exec("update-link", {
      id: B4,
      link: N3
    }) : O5((D4) => {
      const d = (D4 || []).map((M2) => ({
        ...M2,
        data: M2.data.map(
          (U5) => U5.id === B4 ? { ...U5, ...N3 } : U5
        )
      }));
      return s && s({
        view: "links",
        event: {
          id: B4,
          action: "update-link",
          data: {
            id: B4,
            link: N3
          }
        },
        values: {
          predecessors: d[0].data,
          successors: d[1].data
        }
      }), d;
    });
  }
  const te4 = x2(() => ne6(), [f, z4, Q5]), X6 = G3 && !G3[0].data.length && !G3[1].data.length, E4 = [
    "wx-j93aYGQf",
    "wx-wrapper",
    l !== "links" ? "wx-nobatch" : ""
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ ue4("div", { className: E4, children: [
    (G3 || []).map(
      (B4, K4) => B4.data.length ? /* @__PURE__ */ ue4($t3, { children: [
        /* @__PURE__ */ a2("div", { className: "wx-j93aYGQf wx-title", children: B4.title }),
        /* @__PURE__ */ a2(
          dt2,
          {
            columns: te4,
            onAction: $2,
            onEdit: q4,
            data: B4.data,
            sizes: {
              rowHeight: 44
            }
          }
        )
      ] }, K4) : null
    ),
    X6 ? /* @__PURE__ */ a2("div", { className: "wx-j93aYGQf wx-nodata", children: f("No links") }) : null
  ] });
}
function os2(t2) {
  const { value: e, time: s, format: n, onchange: o, onChange: l, ...g } = t2, f = l ?? o;
  function u(i3) {
    const w = new Date(i3.value);
    w.setHours(e.getHours()), w.setMinutes(e.getMinutes()), f && f({ value: w });
  }
  return /* @__PURE__ */ ue4("div", { className: "wx-hFsbgDln date-time-controll", children: [
    /* @__PURE__ */ a2(
      tn,
      {
        ...g,
        value: e,
        onChange: u,
        format: n,
        buttons: ["today"],
        clear: false
      }
    ),
    s ? /* @__PURE__ */ a2(hn, { value: e, onChange: f, format: n }) : null
  ] });
}
function St3(t2) {
  const { row: e, data: s } = t2, n = x2(() => s || e, [s, e]);
  return n ? /* @__PURE__ */ ue4(Pe2, { children: [
    /* @__PURE__ */ a2("div", { className: "wx-avatar wx-aadUoSB7", children: /* @__PURE__ */ a2(Nn, { value: n, size: 40 }) }),
    /* @__PURE__ */ ue4("div", { className: "wx-text wx-aadUoSB7", children: [
      /* @__PURE__ */ a2("div", { className: "wx-name wx-aadUoSB7", children: n.name }),
      n.role ? /* @__PURE__ */ a2("div", { className: "wx-role wx-aadUoSB7", children: n.role }) : null
    ] })
  ] }) : null;
}
function cs2({
  api: t2,
  autoSave: e,
  onExtChange: s,
  taskAssignments: n = null
}) {
  const o = be4(Qt.i18n), l = x2(() => o.getGroup("gantt"), [o]), g = useStore(t2, "activeTask"), f = useStore(t2, "resources"), u = useStore(t2, "_assignments"), i3 = useStore(t2, "assignments"), [w, H3] = ce5(), [L5, S4] = ce5(null), [v, z4] = ce5([]);
  ie5(() => {
    z4(
      n || t2.getTaskResources(g).map((d) => ({ ...d, resource: d.id, id: d.assignmentId }))
    );
  }, [t2, g, u, n]);
  const R4 = x2(() => {
    const d = [];
    return f.eachChild((M2) => {
      M2.data || d.push({ ...M2, label: M2.name });
    }, 0), d;
  }, [f]), Q5 = x2(() => R4.filter(
    (d) => !v.find((M2) => M2.resource === d.id)
  ), [R4, v]);
  function ne6(d) {
    return {
      view: "resources",
      event: d,
      values: {
        taskAssignments: v
      }
    };
  }
  function ee5(d) {
    w.exec("close-editor", { ignore: true }), e ? t2.exec("delete-assignment", { id: d }) : (z4((M2) => M2.filter((U5) => U5.id !== d)), s && s(
      ne6({
        id: d,
        action: "delete-assignment",
        data: { id: d }
      })
    )), S4(null);
  }
  function G3(d, M2) {
    M2 = { ...M2, units: 100, task: g, id: d };
    const U5 = { assignment: M2 };
    if (e)
      t2.exec("add-assignment", U5);
    else {
      const le4 = f?.byId(M2.resource);
      z4((ae4) => [...ae4, { ...le4, ...M2 }]), s && s(
        ne6({
          id: le4.id,
          action: "add-assignment",
          data: U5
        })
      );
    }
  }
  function O5(d) {
    return d.id === L5 ? Q5 : [R4.find((U5) => U5.id === d.resource)].concat(Q5);
  }
  function $2(d, M2) {
    let U5 = i3.byId(d);
    U5 || (U5 = v.find((ae4) => ae4.id === d));
    const le4 = {
      id: d,
      assignment: { units: U5.units || 100, ...M2, id: d }
    };
    e ? t2.exec("update-assignment", le4) : (M2.resource && M2.resource !== U5.resource && (M2 = { ...f?.byId(M2.resource), ...le4.assignment }), z4(
      (ae4) => ae4.map((re3) => re3.id === d ? { ...re3, ...M2 } : re3)
    ), s && s(
      ne6({
        id: d,
        action: "update-assignment",
        data: le4
      })
    ));
  }
  const q4 = x2(() => [
    {
      id: "resource",
      header: l("Resource"),
      cell: St3,
      type: "string",
      flexgrow: 3,
      editor: (d) => ({
        type: "combo",
        config: {
          options: O5(d),
          cell: St3
        }
      }),
      options: R4
    },
    {
      id: "units",
      header: l("Units"),
      flexgrow: 1,
      editor: {
        type: "text",
        config: { type: "number" }
      },
      template: (d) => `${d}%`
    },
    {
      id: "delete",
      header: "",
      cell: Xe3,
      width: 50,
      align: "center"
    }
  ], [Q5, R4, l, L5]);
  function te4(d, M2) {
    d && M2 === "delete" && ee5(d);
  }
  function X6(d, M2, U5) {
    if (M2 === "units") $2(d, { units: U5 * 1 });
    else if (M2 === "resource") {
      const le4 = { resource: U5 };
      d === L5 ? G3(d, le4) : $2(d, le4);
    }
    S4(null);
  }
  const E4 = V6(L5);
  ie5(() => {
    E4.current = L5;
  }, [L5]);
  function B4(d) {
    H3(d), d.on("close-editor", () => {
      E4.current && (d.exec("delete-row", { id: E4.current }), S4(null));
    });
  }
  const K4 = x2(
    () => L5 || !Q5.length,
    [L5, Q5]
  ), F5 = V6(false);
  function N3() {
    if (w?.exec("close-editor", { ignore: true }), !F5.current) {
      F5.current = true;
      const d = tempID();
      S4(d), requestAnimationFrame(() => {
        D4(d), F5.current = false;
      });
    }
  }
  function D4(d) {
    w.exec("add-row", { id: d, row: { units: 100 } }), setTimeout(() => {
      w.exec("open-editor", { id: d, column: "resource" });
    });
  }
  return /* @__PURE__ */ ue4("div", { className: "wx-aabce6pu wx-section", children: [
    v.length || L5 ? /* @__PURE__ */ a2(
      dt2,
      {
        onInit: B4,
        columns: q4,
        onAction: te4,
        onEdit: X6,
        data: v,
        sizes: {
          rowHeight: 52
        }
      }
    ) : /* @__PURE__ */ a2("div", { className: "wx-aabce6pu wx-nodata", children: l("No assignments") }),
    /* @__PURE__ */ a2("div", { className: "wx-aabce6pu wx-button-wrapper", children: /* @__PURE__ */ a2(
      le,
      {
        disabled: K4,
        icon: "wxi-plus",
        css: "wx-button",
        onClick: N3,
        children: l("Add resource")
      }
    ) })
  ] });
}
function is2({ api: t2, autoSave: e, segments: s, onExtChange: n }) {
  const o = n, l = be4(Qt.i18n), g = x2(() => l.getGroup("gantt"), [l]), f = x2(() => {
    const G3 = l.getRaw(), O5 = G3.gantt?.dateFormat || G3.formats?.dateFormat;
    return dateToString(O5, G3.calendar);
  }, [l]), u = useStore(t2, "_activeTask"), [i3, w] = ce5([]);
  function H3() {
    return !u || s === null ? [] : s ? [...s] : u?.segments?.map((G3) => ({
      ...G3,
      id: G3.id || tempID()
    }));
  }
  ie5(() => {
    w(H3());
  }, [u, s]);
  const L5 = x2(() => [
    {
      id: "text",
      header: g("Name"),
      type: "string",
      flexgrow: 3,
      editor: "text"
    },
    {
      id: "start",
      header: g("Start"),
      flexgrow: 2,
      template: (G3) => f(G3),
      editor: "datepicker"
    },
    {
      id: "duration",
      header: g("Duration"),
      flexgrow: 2,
      editor: {
        type: "text",
        config: { type: "number" }
      }
    },
    {
      id: "delete",
      header: "",
      cell: Xe3,
      width: 50,
      align: "center"
    }
  ], [g, f]), [S4, v] = ce5(null);
  function z4(G3) {
    v(G3);
  }
  function R4(G3) {
    return {
      view: "segments",
      event: G3,
      values: {
        segments: i3.length ? [...i3] : null
      }
    };
  }
  function Q5(G3) {
    const O5 = i3.findIndex((te4) => te4.id === G3), $2 = i3.filter((te4, X6) => X6 !== O5);
    w($2);
    const q4 = {
      id: u.id,
      task: {
        segments: $2.length ? [...$2] : null
      }
    };
    e ? t2.exec("update-task", q4) : o && o(
      R4({
        id: G3,
        action: "update-task",
        data: q4
      })
    );
  }
  function ne6(G3, O5) {
    O5 === "delete" && Q5(G3);
  }
  function ee5(G3, O5, $2) {
    const { data: q4 } = S4.getState();
    let te4 = q4.findIndex((B4) => B4.id === G3);
    O5 === "duration" && ($2 = $2 * 1);
    const X6 = { ...i3[te4], [O5]: $2 };
    ha(
      X6,
      t2.getState(),
      t2.getTaskCalendar(u),
      O5
    );
    const E4 = {
      id: u.id,
      segmentIndex: te4,
      task: X6
    };
    e ? t2.exec("update-task", E4) : (w(
      (B4) => B4.map((K4) => K4.id === G3 ? { ...K4, ...X6 } : K4)
    ), o && o(
      R4({
        id: G3,
        action: "update-task",
        data: E4
      })
    ));
  }
  return /* @__PURE__ */ a2("div", { className: "wx-section wx-aabvtaY1", children: i3.length ? /* @__PURE__ */ a2(
    dt2,
    {
      columns: L5,
      onInit: z4,
      onAction: ne6,
      data: i3,
      onEdit: ee5
    }
  ) : /* @__PURE__ */ a2("div", { className: "wx-nodata wx-aabvtaY1", children: g("No segments") }) });
}
z3("select", an);
z3("date", os2);
z3("twostate", Bt);
z3("slider", Le);
z3("counter", xn);
z3("links", rs2);
z3("checkbox", _e);
z3("resources", cs2);
z3("segments", is2);
I3("tabs", wn);
function Ds2({ fonts: t2 = true, children: e }) {
  return e ? /* @__PURE__ */ a2(yn, { fonts: t2, children: /* @__PURE__ */ a2(Ho, { children: e }) }) : /* @__PURE__ */ ue4(Pe2, { children: [
    /* @__PURE__ */ a2(Ho, {}),
    /* @__PURE__ */ a2(yn, { fonts: t2 })
  ] });
}
function Is2({ fonts: t2 = true, children: e }) {
  return e ? /* @__PURE__ */ a2(bn, { fonts: t2, children: /* @__PURE__ */ a2(ko, { children: e }) }) : /* @__PURE__ */ ue4(Pe2, { children: [
    /* @__PURE__ */ a2(ko, { fonts: t2 }),
    /* @__PURE__ */ a2(bn, { fonts: t2 })
  ] });
}
var ds2 = "2.7.1";
var fs2 = {
  version: ds2
};
var _s2 = fs2.version;
export {
  Ns2 as Gantt,
  Ds2 as Willow,
  Is2 as WillowDark
};
