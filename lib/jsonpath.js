/* JSONPath 0.8.0 - XPath for JSON
 *
 * Copyright (c) 2007 Stefan Goessner (goessner.net)
 * Licensed under the MIT (MIT-LICENSE.txt) licence.
 */

var isNode = false;
(function(exports, require) {

// Keep compatibility with old browsers
if (!Array.isArray) {
  Array.isArray = function(vArg) {
   return Object.prototype.toString.call(vArg) === "[object Array]";
  };
}

if ( 'function' !== typeof Array.prototype.reduce ) {
  Array.prototype.reduce = function( callback /*, initialValue*/ ) {
    if ( null === this || 'undefined' === typeof this ) {
      throw new TypeError(
         'Array.prototype.reduce called on null or undefined' );
    }
    if ( 'function' !== typeof callback ) {
      throw new TypeError( callback + ' is not a function' );
    }
    var t = Object( this ), len = t.length >>> 0, k = 0, value;
    if ( arguments.length >= 2 ) {
      value = arguments[1];
    } else {
      while ( k < len && ! k in t ) k++; 
      if ( k >= len )
        throw new TypeError('Reduce of empty array with no initial value');
      value = t[ k++ ];
    }
    for ( ; k < len ; k++ ) {
      if ( k in t ) {
         value = callback( value, t[k], k, t );
      }
    }
    return value;
  };
}

// Production steps of ECMA-262, Edition 5, 15.4.4.19
// Reference: http://es5.github.com/#x15.4.4.19
if (!Array.prototype.map) {

  Array.prototype.map = function (callback, thisArg) {

    var T, A, k;

    if (this == null) {
      throw new TypeError(" this is null or not defined");
    }

    // 1. Let O be the result of calling ToObject passing the |this| value as the argument.
    var O = Object(this);

    // 2. Let lenValue be the result of calling the Get internal method of O with the argument "length".
    // 3. Let len be ToUint32(lenValue).
    var len = O.length >>> 0;

    // 4. If IsCallable(callback) is false, throw a TypeError exception.
    // See: http://es5.github.com/#x9.11
    if (typeof callback !== "function") {
      throw new TypeError(callback + " is not a function");
    }

    // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
    if (arguments.length > 1) {
      T = thisArg;
    }

    // 6. Let A be a new array created as if by the expression new Array( len) where Array is
    // the standard built-in constructor with that name and len is the value of len.
    A = new Array(len);

    // 7. Let k be 0
    k = 0;

    // 8. Repeat, while k < len
    while (k < len) {

      var kValue, mappedValue;

      // a. Let Pk be ToString(k).
      //   This is implicit for LHS operands of the in operator
      // b. Let kPresent be the result of calling the HasProperty internal method of O with argument Pk.
      //   This step can be combined with c
      // c. If kPresent is true, then
      if (k in O) {

        // i. Let kValue be the result of calling the Get internal method of O with argument Pk.
        kValue = O[k];

        // ii. Let mappedValue be the result of calling the Call internal method of callback
        // with T as the this value and argument list containing kValue, k, and O.
        mappedValue = callback.call(T, kValue, k, O);

        // iii. Call the DefineOwnProperty internal method of A with arguments
        // Pk, Property Descriptor {Value: mappedValue, Writable: true, Enumerable: true, Configurable: true},
        // and false.

        // In browsers that support Object.defineProperty, use the following:
        // Object.defineProperty( A, k, { value: mappedValue, writable: true, enumerable: true, configurable: true });

        // For best browser support, use the following:
        A[k] = mappedValue;
      }
      // d. Increase k by 1.
      k++;
    }

    // 9. return A
    return A;
  };
}


if (!Array.prototype.filter) {
   Array.prototype.filter = function(fun /*, thisArg */) {
      if (this === void 0 || this === null)
      throw new TypeError();

      var t = Object(this);
      var len = t.length >>> 0;
      if (typeof fun !== "function")
      throw new TypeError();

      var res = [];
      var thisArg = arguments.length >= 2 ? arguments[1] : void 0;
      for (var i = 0; i < len; i++) {
         if (i in t) {
           var val = t[i];

           // NOTE: Technically this should Object.defineProperty at
           //       the next index, as push can be affected by
           //       properties on Object.prototype and Array.prototype.
           //       But that method's new, and collisions should be
           //       rare, so use the more-compatible alternative.
           if (fun.call(thisArg, val, i, t)) 
             res.push(val);
         }
      }

      return res;
   };
}

// Make sure to know if we are in real node or not (the `require` variable
// could actually be require.js, for example.
var isNode = typeof module !== 'undefined' && !!module.exports;

var vm = isNode ?
    require('vm') : {
      runInNewContext: function(expr, context) { with (context) return eval(expr); }
    };
exports.eval = jsonPath;

var cache = {};

function push(arr, elem) { arr = arr.slice(); arr.push(elem); return arr; }
function unshift(elem, arr) { arr = arr.slice(); arr.unshift(elem); return arr; }

function jsonPath(obj, expr, arg) {
   var P = {
      resultType: arg && arg.resultType || "VALUE",
      flatten: arg && arg.flatten || false,
      wrap: (arg && arg.hasOwnProperty('wrap')) ? arg.wrap : true,
      sandbox: (arg && arg.sandbox) ? arg.sandbox : {},
      normalize: function(expr) {
         if (cache[expr]) return cache[expr];
         var subx = [];
         var normalized = expr.replace(/[\['](\??\(.*?\))[\]']/g, function($0,$1){return "[#"+(subx.push($1)-1)+"]";})
                     .replace(/'?\.'?|\['?/g, ";")
                     .replace(/(;)?(\^+)(;)?/g, function(_, front, ups, back) { return ';' + ups.split('').join(';') + ';'; })
                     .replace(/;;;|;;/g, ";..;")
                     .replace(/;$|'?\]|'$/g, "");
         var exprList = normalized.split(';').map(function(expr) {
            var match = expr.match(/#([0-9]+)/);
            return !match || !match[1] ? expr : subx[match[1]];
         });
         return cache[expr] = exprList;
      },
      asPath: function(path) {
         var x = path, p = "$";
         for (var i=1,n=x.length; i<n; i++)
            p += /^[0-9*]+$/.test(x[i]) ? ("["+x[i]+"]") : ("['"+x[i]+"']");
         return p;
      },
      trace: function(expr, val, path) {
         // no expr to follow? return path and value as the result of this trace branch
         if (!expr.length) return [{path: path, value: val}];

         var loc = expr[0], x = expr.slice(1);
         // the parent sel computation is handled in the frame above using the
         // ancestor object of val
         if (loc === '^') return path.length ? [{path: path.slice(0,-1), expr: x, isParentSelector: true}] : [];

         // we need to gather the return value of recursive trace calls in order to
         // do the parent sel computation.
         var ret = [];
         function addRet(elems) { ret = ret.concat(elems); }

         if (val && val.hasOwnProperty(loc)) // simple case, directly follow property
            addRet(P.trace(x, val[loc], push(path, loc)));
         else if (loc === "*") { // any property
            P.walk(loc, x, val, path, function(m,l,x,v,p) {
               addRet(P.trace(unshift(m, x), v, p)); });
         }
         else if (loc === "..") { // all chid properties
            addRet(P.trace(x, val, path));
            P.walk(loc, x, val, path, function(m,l,x,v,p) {
               if (typeof v[m] === "object")
                  addRet(P.trace(unshift("..", x), v[m], push(p, m)));
            });
         }
         else if (loc[0] === '(') { // [(expr)]
            addRet(P.trace(unshift(P.eval(loc, val, path[path.length], path),x), val, path));
         }
         else if (loc.indexOf('?(') === 0) { // [?(expr)]
            P.walk(loc, x, val, path, function(m,l,x,v,p) {
               if (P.eval(l.replace(/^\?\((.*?)\)$/,"$1"),v[m],m, path))
                  addRet(P.trace(unshift(m,x),v,p));
            });
         }
         else if (loc.indexOf(',') > -1) { // [name1,name2,...]
            for (var parts = loc.split(','), i = 0; i < parts.length; i++)
               addRet(P.trace(unshift(parts[i], x), val, path));
         }
         else if (/^(-?[0-9]*):(-?[0-9]*):?([0-9]*)$/.test(loc)) { // [start:end:step]  python slice syntax
            addRet(P.slice(loc, x, val, path));
         }

         // we check the resulting values for parent selections. for parent
         // selections we discard the value object and continue the trace with the
         // current val object
         return ret.reduce(function(all, ea) {
            return all.concat(ea.isParentSelector ? P.trace(ea.expr, val, ea.path) : [ea]);
         }, []);
      },
      walk: function(loc, expr, val, path, f) {
         if (Array.isArray(val))
            for (var i = 0, n = val.length; i < n; i++)
               f(i, loc, expr, val, path);
         else if (typeof val === "object")
            for (var m in val)
               if (val.hasOwnProperty(m))
                  f(m, loc, expr, val, path);
      },
      slice: function(loc, expr, val, path) {
         if (!Array.isArray(val)) return;
         var len = val.length, parts = loc.split(':'),
             start = (parts[0] && parseInt(parts[0])) || 0,
             end = (parts[1] && parseInt(parts[1])) || len,
             step = (parts[2] && parseInt(parts[2])) || 1;
         start = (start < 0) ? Math.max(0,start+len) : Math.min(len,start);
         end   = (end < 0)   ? Math.max(0,end+len)   : Math.min(len,end);
         var ret = [];
         for (var i = start; i < end; i += step)
            ret = ret.concat(P.trace(unshift(i,expr), val, path));
         return ret;
      },
      eval: function(code, _v, _vname, path) {
         if (!$ || !_v) return false;
         if (code.indexOf("@path") > -1) {
            P.sandbox["_path"] = P.asPath(path.concat([_vname]));
            code = code.replace(/@path/g, "_path");
         }
         if (code.indexOf("@") > -1) {
            P.sandbox["_v"] = _v;
            code = code.replace(/@/g, "_v");
         }
         try {
             return vm.runInNewContext(code, P.sandbox);
         }
         catch(e) {
             console.log(e);
             throw new Error("jsonPath: " + e.message + ": " + code);
         }
      }
   };

   var $ = obj;
   var resultType = P.resultType.toLowerCase();
   if (expr && obj && (resultType == "value" || resultType == "path")) {
      var exprList = P.normalize(expr);
      if (exprList[0] === "$" && exprList.length > 1) exprList.shift();
      var result = P.trace(exprList, obj, ["$"]);
      result = result.filter(function(ea) { return ea && !ea.isParentSelector; });
      if (!result.length) return P.wrap ? [] : false;
      if (result.length === 1 && !P.wrap && !Array.isArray(result[0].value)) return result[0][resultType] || false;
      return result.reduce(function(result, ea) {
         var valOrPath = ea[resultType];
         if (resultType === 'path') valOrPath = P.asPath(valOrPath);
         if (P.flatten && Array.isArray(valOrPath)) {
            result = result.concat(valOrPath);
         } else {
            result.push(valOrPath);
         }
         return result;
      }, []);
   }
}
})(typeof exports === 'undefined' ? this['jsonPath'] = {} : exports, typeof require == "undefined" ? null : require);
