// Mark the phase of an entire `fa'.
var fa_phase = function(fa, phase) {
 var ss = fa["states"];
 dict_keys(ss).map(function(src) {
  dict_keys(ss[src]["transit"]).map(function(c) {
   dict_keys(ss[src]["transit"][c]).map(function(dest) {
    ss[src]["transit"][c][dest] = phase;
   });
  });
  ss[src]["phase"] = phase;
 });
 return fa;
};

var nfae_maker = function(ast) {
 this.fas = [];
 this.xtras = [];
 this.iterAst = new iter_ast(ast);
 this.alloc = new sid_alloc();
 this.phase = PHASE_NEW;

 this.is_end = function() { return this.phase == PHASE_OLD; };

 this.get_snapshot = function() {
  return clone({ "ast": this.iterAst.ast, "fas": this.fas });
 };

 this.iter = function() {
  var that = this;

  var faex_make = function(fa, ex) { return { "fa": fa, "ex": ex }; };

  // Make new node.
  var faex_node = function() {
   var sid = that.alloc.alloc(), ss = {};
   ss[sid] = { "transit": {}, "phase": PHASE_CUR };
   return faex_make({
     "initial": sid,
     "accept": [sid],
     "states": ss
    }, { "dangle": {} });
  };

  // Mark the initial state as dangling.
  var faex_dangle_init = function(c, faex) {
   faex["ex"]["dangle"][faex["fa"]["initial"]] = c;
   return faex;
  };

  // Merge two `fa's.
  var faex_plus = function(faexs) {
   return faex_make({
     "initial": faexs[0]["fa"]["initial"],
     "accept": array_cat(array_extract(faexs, ["fa", "accept"])),
     "states": dict_plus(array_extract(faexs, ["fa", "states"]))
    }, { "dangle": dict_plus(array_extract(faexs, ["ex", "dangle"])) }
   );
  };

  // Connect dangling states in `faex1' to `faex2'.  The real work is done in
  // `faex', which should usually be merged from `faex1' and `faex2'.
  var faex_conn = function(faex, faex1, faex2) {
   var dest = faex2["fa"]["initial"], dels = faex1["fa"]["accept"];
   var ss = faex["fa"]["states"], dangle = faex["ex"]["dangle"];
   dict_keys(faex1["ex"]["dangle"]).map(function(src) {
    var dests = ss[src]["transit"][dangle[src]];
    array_and(dict_keys(dests), dels).map(function(s) { delete dests[s]; });
    dests[dest] = PHASE_CUR;
    delete dangle[src];
   });
   faex["fa"]["accept"] = array_minus(faex["fa"]["accept"], dels);
   dels.map(function(s) {
    delete ss[s];
    that.alloc.free(s);
   });
  };

  // Merge and connect multiple `faex's.
  var faex_cat = function(faexs) {
   var ret = faex_plus(faexs);
   faexs.reduce(function(faex1, faex2, _, __) {
    faex_conn(ret, faex1, faex2);
    return faex2;
   });
   return ret;
  };

  // Make a forking state with `c' transits to `faex's.
  var faex_fork = function(c, faexs) {
   var fork = faex_node();
   var tr = fork["fa"]["states"][fork["fa"]["initial"]]["transit"];
   fork["fa"]["accept"] = [];
   tr[c] = {};
   faexs.map(function(faex) {
    tr[c][faex["fa"]["initial"]] = PHASE_CUR;
   });
   return faex_plus([fork].concat(faexs));
  };

  // Make a dangled forking state.
  var faex_dangle_fork = function(c, faexs) {
   return faex_dangle_init(c, faex_fork(c, faexs));
  };

  var faex_push = function(faex) {
   that.fas.push(faex["fa"]);
   that.xtras.push(faex["ex"]);
  };

  var faex_pop = function() {
   return { "fa": that.fas.pop(), "ex": that.xtras.pop() };
  };

  var faex_refresh = function() {
   that.fas.map(function(fa) { fa_phase(fa, PHASE_NEW); });
  };

  if (this.phase == PHASE_OLD) /* Do nothing. */ ;
  else if (this.phase == PHASE_NEW) this.phase = PHASE_CUR;
  else {
   this.iterAst.iter();
   if (this.iterAst.is_end()) {
    faex_refresh();
    if (this.xtras != null) {
     var faex = faex_pop();
     if (dict_keys(faex["fa"]["states"]).length == 1) {
      faex["ex"]["dangle"] = {};
      faex_push(faex);
     } else faex_push(faex_cat([faex, faex_node()]));
     this.xtras = null;
    } else this.phase = PHASE_OLD;
   } else {
    faex_refresh();
    var cur = this.iterAst.visit();
    switch(cur["type"]) {
     case "chr":
      faex_push(faex_dangle_fork(cur["info"], [faex_node()]));
      break;
     case "sub":
      /* Do nothing. */
      break;
     case "?":
      faex_push(faex_dangle_fork("", [faex_pop(), faex_node()]));
      break;
     case "*":
      var ker = faex_pop();
      var faex = faex_dangle_fork("", [ker, faex_node()]);
      faex_conn(faex, ker, faex);
      faex_push(faex);
      break;
     case "cat":
      var faex2 = faex_pop(), faex1 = faex_pop();
      faex_push(faex_cat([faex1, faex2]));
      break;
     case "|":
      var faex2 = faex_pop(), faex1 = faex_pop();
      faex_push(faex_fork("", [faex1, faex2]));
      break;
     case "nil":
      faex_push(faex_dangle_init("", faex_node()));
      break;
    }
   }
  }
  return this.get_snapshot();
 };
};

var nfae_base = function(nfae) {
 this.nfae = clone(nfae);

 this.fa_phase_states = function(sids, phase) {
  var ss = this.nfae["states"];
  sids.map(function(s) { ss[s]["phase"] = phase; });
 };

 this.fa_is_accept = function(sids) {
  return array_and(this.nfae["accept"], sids).length > 0;
 };

 this.fa_avail_transit = function(sids) {
  var ss = this.nfae.states, ret = new HashSet();
  sids.map(function(s) {
   ret.addAll(dict_keys(ss[s]["transit"]));
  });
  return ret.values().sort();
 };

 this.fa_transit_base = function(sids, c, ph, orig) {
  var that = this, ss = this.nfae.states, ret = new HashSet();
  sids.map(function(s0) {
   var tr = ss[s0]["transit"][c];
   dict_keys(tr).map(function(s1) {
    ret.add(s1);
    ss[s1]["phase"] = ph;
    tr[s1] = ph;
   });
   if (orig) ss[s0]["phase"] = ph;
  });
  return ret;
 };

 this.fa_transit = function(sids, c, ph) {
  return array_from_set(this.fa_transit_base(sids, c, ph, false));
 };
};

var nfa_maker = function(nfae) {
 this.base = new nfae_base(nfae);
 this.nfa = { "initial": null, "accept": [], "states": {} };
 this.zids = {};
 this.cur = { "zid": null, "sids": [], "transit": [], "idx": 0, };
 this.queue = [];
 this.alloc = new sid_alloc();
 this.phase = PHASE_NEW;

 this.is_end = function() { return this.phase == PHASE_OLD; };

 this.get_snapshot = function() {
  return clone({ "nfae": this.base.nfae, "nfa": this.nfa });
 };

 this.refresh = function() {
  fa_phase(this.base.nfae, PHASE_NEW);
  fa_phase(this.nfa, PHASE_NEW);
 };

 this.fa_eclose = function(s, ph) {
  var base = this.base, ret = new HashSet(), dif = new HashSet();
  dif.add(s);
  while (!dif.isEmpty()) {
   ret = ret.union(dif);
   dif = base.fa_transit_base(dif.values(), "", ph, true).complement(ret);
  };
  return array_from_set(ret);
 };

 this.fa_ecloses = function(sids, ph) {
  var that = this, ret = new HashSet();
  sids.map(function(s) { ret.addAll(that.fa_eclose(s, ph)); });
  return array_from_set(ret);
 };

 this.add_zid = function(z, ph) {
  var ss = this.nfa["states"];
  if (!dict_has(this.zids, z)) {
   this.zids[z] = this.alloc.alloc();
   if (this.nfa["initial"] != null) this.queue.push(z);
   this.nfa["states"][this.zids[z]] = { "transit": {}, "phase": ph };
  } else ss[this.zids[z]]["phase"] = ph;
 };

 this.prepare_cur = function(sids) {
  var base = this.base, cur = this.cur;
  cur["idx"] = 0;
  cur["sids"] = this.fa_ecloses(sids, PHASE_CUR);
  var z = sids_zip(cur["sids"]);
  this.add_zid(z, PHASE_CUR);
  cur["zid"] = z;
  if (base.fa_is_accept(cur["sids"])) this.nfa["accept"].push(this.zids[z]);

  var ss = base.nfae["states"];
  cur["transit"] = [];
  this.fa_ecloses(sids, PHASE_CUR).map(function(s) {
   dict_keys(ss[s]["transit"]).map(function(c) {
    var dests = dict_keys(ss[s]["transit"][c]);
    if (c != "") dests.map(function(d) {
     cur["transit"].push({ "src": s, "c": c, "dest": d });
    });
   });
  });
 };

 this.iter = function() {
  var that = this, base = this.base, cur = this.cur;
  var get_zid = function() { return that.zids[cur["zid"]]; };

  if (this.phase == PHASE_OLD) /* Do nothing. */ ;
  else if (this.phase == PHASE_NEW) this.phase = PHASE_CUR;
  else if (this.nfa["initial"] == null) {
   this.prepare_cur([base.nfae["initial"]]);
   this.nfa["initial"] = get_zid();
  } else {
   this.refresh();
   if (cur["idx"] < cur["transit"].length) {
    this.fa_ecloses(cur["sids"], PHASE_OLD);
    this.add_zid(cur["zid"], PHASE_OLD);

    var tr1 = cur["transit"][cur["idx"]];
    var c = tr1["c"], dest = tr1["dest"];
    base.nfae["states"][tr1["src"]]["transit"][c][dest] = PHASE_CUR;
    var z = sids_zip(this.fa_ecloses([dest], PHASE_CUR));
    this.add_zid(z, PHASE_CUR);

    var tr2 = this.nfa["states"][get_zid()]["transit"];
    if (!dict_has(tr2, c)) tr2[c] = {};
    tr2[c][this.zids[z]] = PHASE_CUR;

    ++cur["idx"];
   } else if (this.queue.length > 0) {
    this.prepare_cur(sids_unzip(this.queue.shift()));
   } else this.phase = PHASE_OLD;
  }

  return this.get_snapshot();
 };
};

var dfa_maker = function(nfae) {
 this.base = new nfae_base(nfae);
 this.dfa = { "initial": null, "accept": [], "states": {} };
 this.zids = {};
 this.cur = { "zid": null, "sids": [], "cs": [], "idx": 0 };
 this.queue = [];
 this.alloc = new sid_alloc();
 this.phase = PHASE_NEW;

 this.is_end = function() { return this.phase == PHASE_OLD; };

 this.get_snapshot = function() {
  return clone({ "nfae": this.base.nfae, "dfa": this.dfa });
 };

 this.refresh = function() {
  fa_phase(this.base.nfae, PHASE_NEW);
  fa_phase(this.dfa, PHASE_NEW);
 };

 this.add_zid = function(z, ph) {
  var ss = this.dfa["states"];
  if (!dict_has(this.zids, z)) {
   this.zids[z] = this.alloc.alloc();
   if (this.dfa["initial"] != null) this.queue.push(z);
   this.dfa["states"][this.zids[z]] = {
    "transit": {}, "phase": ph
   };
  } else ss[this.zids[z]]["phase"] = ph;
 };

 this.prepare_cur = function(sids) {
  var base = this.base, cur = this.cur;
  cur["idx"] = 0;
  cur["sids"] = sids;
  base.fa_phase_states(sids, PHASE_CUR);
  cur["cs"] = base.fa_avail_transit(cur["sids"]);
  var z = sids_zip(cur["sids"]);
  this.add_zid(z, PHASE_CUR);
  cur["zid"] = z;
  if (base.fa_is_accept(cur["sids"])) this.dfa["accept"].push(this.zids[z]);
 };

 this.iter = function() {
  var that = this, base = this.base, cur = this.cur;
  var get_zid = function() { return that.zids[cur["zid"]]; };

  if (this.phase == PHASE_OLD) /* Do nothing. */ ;
  else if (this.phase == PHASE_NEW) this.phase = PHASE_CUR;
  else if (this.dfa["initial"] == null) {
   this.prepare_cur([base.nfae["initial"]]);
   this.dfa["initial"] = get_zid();
  } else {
   this.refresh();
   if (cur["idx"] < cur["cs"].length) {
    base.fa_phase_states(cur["sids"], PHASE_OLD);
    this.add_zid(cur["zid"], PHASE_OLD);

    var c = cur["cs"][cur["idx"]];
    var z = sids_zip(base.fa_transit(cur["sids"], c, PHASE_CUR));
    this.add_zid(z, PHASE_CUR);

    var tr = this.dfa["states"][get_zid()]["transit"];
    tr[c] = {};
    tr[c][this.zids[z]] = PHASE_CUR;

    ++cur["idx"];
   } else if (this.queue.length > 0) {
    this.prepare_cur(sids_unzip(this.queue.shift()));
   } else this.phase = PHASE_OLD;
  }

  return this.get_snapshot();
 };
};

var tom_nfae_matcher = function(nfae) {
 this.base = new nfae_base(nfae);
 this.str = null;
 this.cur = null;
 this.phase = null;

 this.is_end = function() { return this.phase == PHASE_OLD; };

 this.get_snapshot = function() {
  return clone({
   "str": fmt_str(this.str, this.cur["idx"] - 1),
   "nfae": this.base.nfae,
   "status": this.is_match()
  });
 };

 this.refresh = function() { fa_phase(this.base.nfae, PHASE_NEW); };

 this.init = function(str) {
  this.str = str;
  this.cur = { "idx": -1, "sids": [], "end": false, "fail": false };
  this.phase = PHASE_NEW;
  this.refresh();
 };

 this.is_match = function() {
  return !this.cur["fail"] && this.base.fa_is_accept(this.cur["sids"]);
 };

 this.can_transit = function() {
  return set_from_array(
   this.base.fa_avail_transit(this.cur["sids"])
  ).contains(this.str[this.cur["idx"]]);
 };

 this.iter = function() {
  var base = this.base, cur = this.cur;
  if (this.phase == PHASE_OLD) /* Do nothing. */ ;
  else if (this.phase == PHASE_NEW) this.phase = PHASE_CUR;
  else {
   if (cur["idx"] == -1) {
    cur["sids"] = [base.nfae["initial"]];
    base.fa_phase_states(cur["sids"], PHASE_CUR);
    ++cur["idx"];
   } else if (cur["end"]) {
    this.refresh();
    this.phase = PHASE_OLD;
   } else {
    this.refresh();
    base.fa_phase_states(cur["sids"], PHASE_OLD);
    if (cur["idx"] >= this.str.length) cur["end"] = true;
    else if (!this.can_transit()) {
     cur["end"] = true;
     cur["fail"] = true;
    } else {
     cur["sids"] = base.fa_transit(
      cur["sids"], this.str[cur["idx"]], PHASE_CUR
     );
    }
    ++cur["idx"];
   }
  }
  return this.get_snapshot();
 };

 this.init("");
};

// -*- indent-tabs-mode: nil -*- vim:et:ts=1:sw=1
