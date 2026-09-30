// The `_` helper object available to transform scripts: a curated
// ~20-function set with lodash feel, implemented in plain JS and frozen so a
// script cannot redefine helpers for later code in the same run.
//
// Iteratee arguments accept a function or a property-name string:
//   _.sumBy(items, 'price')  ===  _.sumBy(items, x => x.price)
'use strict';

var _ = (function () {
  function iteratee(fn) {
    if (fn == null) return function (x) { return x; };
    if (typeof fn === 'function') return fn;
    return function (x) { return x == null ? undefined : x[fn]; };
  }

  return {
    get: function (obj, path, fallback) {
      var segs = Array.isArray(path) ? path : String(path).replace(/\[(\d+)\]/g, '.$1').split('.');
      var cur = obj;
      for (var i = 0; i < segs.length; i++) {
        if (segs[i] === '') continue;
        if (cur == null) return fallback;
        cur = cur[segs[i]];
      }
      return cur === undefined ? fallback : cur;
    },
    pick: function (obj, keys) {
      var out = {};
      for (var i = 0; i < keys.length; i++) {
        if (obj != null && keys[i] in obj) out[keys[i]] = obj[keys[i]];
      }
      return out;
    },
    omit: function (obj, keys) {
      var out = {};
      for (var k in obj) {
        if (keys.indexOf(k) < 0) out[k] = obj[k];
      }
      return out;
    },
    keys: Object.keys,
    values: function (obj) { return Object.keys(obj).map(function (k) { return obj[k]; }); },
    uniq: function (arr) {
      return arr.filter(function (v, i) { return arr.indexOf(v) === i; });
    },
    uniqBy: function (arr, fn) {
      var f = iteratee(fn), seen = [], out = [];
      for (var i = 0; i < arr.length; i++) {
        var key = f(arr[i]);
        if (seen.indexOf(key) < 0) { seen.push(key); out.push(arr[i]); }
      }
      return out;
    },
    groupBy: function (arr, fn) {
      var f = iteratee(fn), out = {};
      for (var i = 0; i < arr.length; i++) {
        var key = String(f(arr[i]));
        (out[key] = out[key] || []).push(arr[i]);
      }
      return out;
    },
    keyBy: function (arr, fn) {
      var f = iteratee(fn), out = {};
      for (var i = 0; i < arr.length; i++) out[String(f(arr[i]))] = arr[i];
      return out;
    },
    countBy: function (arr, fn) {
      var f = iteratee(fn), out = {};
      for (var i = 0; i < arr.length; i++) {
        var key = String(f(arr[i]));
        out[key] = (out[key] || 0) + 1;
      }
      return out;
    },
    chunk: function (arr, size) {
      var out = [];
      for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    },
    flatten: function (arr) {
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        if (Array.isArray(arr[i])) out = out.concat(arr[i]);
        else out.push(arr[i]);
      }
      return out;
    },
    compact: function (arr) { return arr.filter(Boolean); },
    first: function (arr) { return arr[0]; },
    last: function (arr) { return arr[arr.length - 1]; },
    range: function (start, end) {
      if (end === undefined) { end = start; start = 0; }
      var out = [];
      for (var i = start; i < end; i++) out.push(i);
      return out;
    },
    sum: function (arr) {
      return arr.reduce(function (acc, v) { return acc + v; }, 0);
    },
    sumBy: function (arr, fn) {
      var f = iteratee(fn);
      return arr.reduce(function (acc, v) { return acc + f(v); }, 0);
    },
    min: function (arr) { return arr.length ? Math.min.apply(null, arr) : undefined; },
    max: function (arr) { return arr.length ? Math.max.apply(null, arr) : undefined; },
    sortBy: function (arr, fn) {
      var f = iteratee(fn);
      return arr.slice().sort(function (a, b) {
        var fa = f(a), fb = f(b);
        return fa < fb ? -1 : fa > fb ? 1 : 0;
      });
    },
    mapValues: function (obj, fn) {
      var f = iteratee(fn), out = {};
      for (var k in obj) out[k] = f(obj[k]);
      return out;
    },
  };
})();

Object.freeze(_);
