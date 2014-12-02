var PHASE_NEW = 0, PHASE_CUR = 1, PHASE_OLD = 2;

var dbg1 = function(obj, hdr) {
 hdr = (hdr == undefined) ? "" : hdr;
 document.write(hdr + JSON.stringify(obj) + "\n");
 return obj;
};

var dbg2 = function(obj) {
 console.log(obj);
 return obj;
};

// Deep copy, does not work for HashSet and member functions.
// (This is why `fa's does not directly use HashSet.)
// Also cannot copy too deep data structures because of recursion limit.
var clone = function(obj) {
 return JSON.parse(JSON.stringify(obj));
};

var set_from_array = function(arr) {
 var hs = new HashSet();
 hs.addAll(arr);
 return hs;
};

var array_from_set = function(s) {
 return s.values().sort(sid_cmp);
};

var array_has = function(arr, x) {
 return arr.indexOf(x) != -1;
};

var dict_has = function(d, k) {
 return Object.prototype.hasOwnProperty.call(d, k);
};

var dict_keys = function(d) {
 var ret = [];
 for (var k in d) if (dict_has(d, k)) ret.push(k);
 return ret;
};

// Intersection.
var array_and = function(arr1, arr2) {
 return set_from_array(arr1).intersection(set_from_array(arr2)).values().sort(sid_cmp);
};

// Union.
var array_plus = function(arr1, arr2) {
 return set_from_array(arr1).union(set_from_array(arr2)).values().sort(sid_cmp);
};

// Complement.
var array_minus = function(arr1, arr2) {
 return set_from_array(arr1).complement(set_from_array(arr2)).values().sort(sid_cmp);
};

// Concatenation.
var array_cat = function(arrs) {
 return arrs.reduce(function(arr1, arr2, _, __) { return arr1.concat(arr2); }, []);
}

var set_plus = function(ss) {
 return ss.reduce(
  function(s1, s2, _, __) { return s1.union(s2); },
  new HashSet()
 );
}

var dict_plus = function(ds) {
 var ret = {};
 ds.map(function(d) {
  for (var k in d) ret[k] = d[k];
 });
 return ret;
};

// (obj, [k_1, k_2, ..., k_n]) -> obj[k_1][k2]...[k_n]
var extract = function(obj, keys) {
 return keys.reduce(function(o, k, _, __) { return o[k]; }, obj);
};

// From ([obj1, obj2, ...], keys1)
// to [extract(obj1, keys), extract(obj2, keys), ...]
var array_extract = function(arr, keys) {
 return arr.map(function(obj) { return extract(obj, keys); });
};

// Numerical id allocator.
var id_alloc = function() {
 this.max = -1;
 this.holes = new HashSet();

 this.alloc = function() {
  if (this.holes.isEmpty()) {
   ++this.max;
   return this.max;
  } else {
   var holes = this.holes.values();
   holes.sort(function(x, y) { return x - y; });
   var hole = holes[0];
   this.holes.remove(hole);
   return hole;
  }
 };

 this.free = function(x) {
  if (x == this.max) {
   --this.max;
   while (this.holes.contains(this.max)) {
    this.holes.remove(this.max)
    --this.max;
   }
  } else this.holes.add(x);
 };
};

// ID string allocator, used because javascript only allows strings as member
// names of objects (and thus keys of dicts).
var sid_alloc = function(prefix) {
 this.allocator = new id_alloc;
 this.alloc = function() {
  return prefix + this.allocator.alloc().toString();
 };
 this.free = function(str) {
  return this.allocator.free(parseInt(str.substr(prefix.length)));
 };
};

// Compare ID strings.
var sid_cmp = function(s1, s2) {
 return parseInt(s1) - parseInt(s2);
};

// sids = ["1", "3"] -> zid = "0101", where ret[0] and ret[1] are "1".
// Uses strings instead of big integers because javascript only support
// machine-precision numbers.
var sids_zip = function(sids) {
 var ret = Array(parseInt(sids[sids.length - 1]) + 2).join("0").split("");
 sids.map(function(s) { ret[parseInt(s)] = "1"; });
 return ret.join("");
};

// Inverse of the function above.
var sids_unzip = function(zid) {
 var sids = [];
 for (var i = 0; i < zid.length; ++i) {
  if (zid[i] == "1") sids.push(i.toString());
 }
 return sids;
};

// Formats a string according to the index of the character being processed.
var fmt_str = function(str, idx) {
 var len = str.length;
 if (len == 0) return [];
 var arr1 = (idx > 0) ?
  [{ "txt": str.substr(0, Math.min(idx, len)), "phase": PHASE_OLD }] : [];
 var arr2 = (idx < len && idx >= 0) ?
  [{ "txt": str[idx], "phase": PHASE_CUR }] : [];
 var arr3 = (idx + 1 < len) ?
  [{ "txt": str.substr(Math.max(idx + 1, 0), len), "phase": PHASE_NEW }] : [];
 return array_cat([arr1, arr2, arr3]);
};

// -*- indent-tabs-mode: nil -*- vim:et:ts=1:sw=1
