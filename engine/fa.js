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
 this.alloc1 = new sid_alloc("");
 this.alloc2 = new sid_alloc("-");
 this.phase = PHASE_NEW;

 this.is_end = function() { return this.phase == PHASE_OLD; };

 this.get_snapshot = function() {
  return clone({ "ast": this.iterAst.ast, "fas": this.fas });
 };

 this.iter = function() {
  var that = this;

  var faex_make = function(fa, ex) { return { "fa": fa, "ex": ex }; };

  // Make new node.
  var faex_node = function(tmp) {
   var sid = (tmp ? that.alloc2 : that.alloc1).alloc(), ss = {};
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
   var dest = faex2["fa"]["initial"], tmps = faex1["fa"]["accept"];
   var ss = faex["fa"]["states"], dangle = faex["ex"]["dangle"];
   dict_keys(faex1["ex"]["dangle"]).map(function(src) {
    var dests = ss[src]["transit"][dangle[src]];
    array_and(dict_keys(dests), tmps).map(function(s) { delete dests[s]; });
    dests[dest] = PHASE_CUR;
    delete dangle[src];
   });
   faex["fa"]["accept"] = array_minus(faex["fa"]["accept"], tmps);
   tmps.map(function(s) {
    delete ss[s];
    that.alloc2.free(s);
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
  var faex_fork = function(c, fork, faexs) {
   var tr = fork["fa"]["states"][fork["fa"]["initial"]]["transit"];
   fork["fa"]["accept"] = [];
   tr[c] = {};
   faexs.map(function(faex) { tr[c][faex["fa"]["initial"]] = PHASE_CUR; });
   return faex_plus([fork].concat(faexs));
  };

  // Make a dangled forking state.
  var faex_dangle_fork = function(faexs) {
   return faex_dangle_init("", faex_fork("", faex_node(false), faexs));
  };

  var faex_push = function(faex) {
   that.fas.push(faex["fa"]);
   that.xtras.push(faex["ex"]);
  };

  var faex_pop = function() {
   return { "fa": that.fas.pop(), "ex": that.xtras.pop() };
  };

  // Mark all automaton fragments as PHASE_NEW.
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
     } else faex_push(faex_cat([faex, faex_node(false)]));
     this.xtras = null;
    } else this.phase = PHASE_OLD;
   } else {
    faex_refresh();
    var cur = this.iterAst.visit();
    switch(cur["type"]) {
     case "chr":
      faex_push(faex_dangle_init(
       cur["info"],
       faex_fork(cur["info"], faex_node(false), [faex_node(true)])
      ));
      break;
     case "sub":
      /* Do nothing. */
      break;
     case "?":
      faex_push(faex_dangle_fork([faex_pop(), faex_node(true)]));
      break;
     case "*":
      var ker = faex_pop();
      var faex = faex_dangle_fork([ker, faex_node(true)]);
      faex_conn(faex, ker, faex);
      faex_push(faex);
      break;
     case "cat":
      var faex2 = faex_pop(), faex1 = faex_pop();
      faex_push(faex_cat([faex1, faex2]));
      break;
     case "|":
      var faex2 = faex_pop(), faex1 = faex_pop();
      faex_push(faex_fork("", faex_node(false), [faex1, faex2]));
      break;
     case "nil":
      faex_push(faex_dangle_init("", faex_node(false)));
      break;
    }
   }
  }
  return this.get_snapshot();
 };
};

var nfa_run_base = function(nfa) {
 this.nfa = clone(nfa);

 // Mark the phase of some states.
 this.fa_phase_states = function(sids, phase) {
  var ss = this.nfa["states"];
  sids.map(function(s) { ss[s]["phase"] = phase; });
 };

 // Mark the phase of one transition.
 this.fa_phase_transit = function(src, c, dest, ph) {
  this.nfa["states"][src]["transit"][c][dest] = ph;
 };

 this.fa_is_accept = function(s) {
  return array_has(this.nfa["accept"], s);
 };

 this.fa_are_accept = function(sids) {
  return array_and(this.nfa["accept"], sids).length != 0;
 };

 this.fa_avail_transit = function(s) {
  return dict_keys(this.nfa.states[s]["transit"]).sort();
 };

 this.fa_avail_transits = function(sids) {
  var that = this, ret = new HashSet();
  sids.map(function(s) {
   ret.addAll(that.fa_avail_transit(s));
  });
  return ret.values().sort();
 };

 this.fa_can_transit = function(sids, c) {
  return array_has(this.fa_avail_transits(sids), c);
 };

 // Do non-deterministic transititions and mark the tracks.
 this.fa_transit_base = function(sids, c, ph, orig) {
  var that = this, ss = this.nfa.states, ret = new HashSet();
  sids.map(function(s0) {
   var tr = ss[s0]["transit"][c];
   dict_keys(tr).sort(sid_cmp).map(function(s1) {
    ret.add(s1);
    ss[s1]["phase"] = ph;
    tr[s1] = ph;
   });
   if (orig) ss[s0]["phase"] = ph;
  });
  return ret;
 };

 // Above function wrapped to return an array instead of a set.
 this.fa_transit = function(sids, c, ph) {
  return array_from_set(this.fa_transit_base(sids, c, ph, false));
 };
};

var nfa_make_base = function() {
 this.nfa = { "initial": null, "accept": [], "states": {} };
 this.zids = {};
 this.queue = [];
 this.alloc = new sid_alloc("");

 // Add a state in phase `ph' for zid `z', or just mark it if existing.
 // Also add it to the queue of breadth-first traversal.
 this.add_state = function(z, ph) {
  var ss = this.nfa["states"];
  if (!dict_has(this.zids, z)) {
   this.zids[z] = this.alloc.alloc();
   if (this.nfa["initial"] != null) this.queue.push(z);
   this.nfa["states"][this.zids[z]] = { "transit": {}, "phase": ph };
  } else ss[this.zids[z]]["phase"] = ph;
 };
};

var nfa_maker = function(nfae) {
 this.rBase = new nfa_run_base(nfae);
 this.mBase = new nfa_make_base();
 this.cur = { "zid": null, "sids": [], "transit": [], "idx": 0, };
 this.phase = PHASE_NEW;

 this.is_end = function() { return this.phase == PHASE_OLD; };

 this.get_snapshot = function() {
  return clone({ "nfae": this.rBase.nfa, "nfa": this.mBase.nfa });
 };

 // Mark NFA-e and NFA as PHASE_NEW.
 this.refresh = function() {
  fa_phase(this.rBase.nfa, PHASE_NEW);
  fa_phase(this.mBase.nfa, PHASE_NEW);
 };

 this.fa_eclose = function(s, ph) {
  var rBase = this.rBase, ret = new HashSet(), dif = new HashSet();
  dif.add(s);
  while (!dif.isEmpty()) {
   ret = ret.union(dif);
   dif = rBase.fa_transit_base(dif.values(), "", ph, true).complement(ret);
  };
  return array_from_set(ret);
 };

 this.fa_ecloses = function(sids, ph) {
  var that = this, ret = new HashSet();
  sids.map(function(s) { ret.addAll(that.fa_eclose(s, ph)); });
  return array_from_set(ret);
 };

 this.iter = function() {
  var that = this, rBase = this.rBase, mBase = this.mBase, cur = this.cur;

  var get_zid = function() { return mBase.zids[cur["zid"]]; };

  // Compute zid and available transitions from sids, and add state to NFA.
  var cur_push = function(sids) {
   cur["idx"] = 0;
   cur["sids"] = that.fa_ecloses(sids, PHASE_CUR);

   var z = sids_zip(cur["sids"]);
   cur["zid"] = z;
   mBase.add_state(z, PHASE_CUR);
   if (rBase.fa_are_accept(cur["sids"])) {
    mBase.nfa["accept"].push(mBase.zids[z]);
   }

   var ss = rBase.nfa["states"];
   cur["transit"] = [];
   that.fa_ecloses(sids, PHASE_CUR).map(function(s) {
    dict_keys(ss[s]["transit"]).sort().map(function(c) {
     var dests = dict_keys(ss[s]["transit"][c]).sort(sid_cmp);
     if (c != "") dests.map(function(d) {
      cur["transit"].push({ "src": s, "c": c, "dest": d });
     });
    });
   });
  };

  // Basically a breadth-first traversal from the initial state.
  if (this.phase == PHASE_OLD) /* Do nothing. */ ;
  else if (this.phase == PHASE_NEW) this.phase = PHASE_CUR;
  else if (mBase.nfa["initial"] == null) {
   cur_push([rBase.nfa["initial"]]);
   mBase.nfa["initial"] = get_zid();
  } else {
   this.refresh();
   if (cur["idx"] < cur["transit"].length) {
    // Mark current as old.
    this.fa_ecloses(cur["sids"], PHASE_OLD);
    mBase.add_state(cur["zid"], PHASE_OLD);

    // Do the transitition and marking.
    var t = cur["transit"][cur["idx"]];
    var c = t["c"], dest = t["dest"];
    rBase.fa_phase_transit(t["src"], c, dest, PHASE_CUR);
    var z = sids_zip(this.fa_eclose(dest, PHASE_CUR));
    // The queue of traversal grows here.
    mBase.add_state(z, PHASE_CUR);

    // Add and mark the transitition in NFA, or just mark it if existing.
    var tr = mBase.nfa["states"][get_zid()]["transit"];
    if (!dict_has(tr, c)) tr[c] = {};
    tr[c][mBase.zids[z]] = PHASE_CUR;

    ++cur["idx"];
   } else if (mBase.queue.length != 0) {
    cur_push(sids_unzip(mBase.queue.shift()));
   } else this.phase = PHASE_OLD;
  }

  return this.get_snapshot();
 };
};

var dfa_maker = function(nfa) {
 this.rBase = new nfa_run_base(nfa);
 this.mBase = new nfa_make_base();
 this.cur = { "zid": null, "sids": [], "cs": [], "idx": 0 };
 this.phase = PHASE_NEW;

 this.is_end = function() { return this.phase == PHASE_OLD; };

 this.get_snapshot = function() {
  return clone({ "nfa": this.rBase.nfa, "dfa": this.mBase.nfa });
 };

 this.refresh = function() {
  fa_phase(this.rBase.nfa, PHASE_NEW);
  fa_phase(this.mBase.nfa, PHASE_NEW);
 };

 this.iter = function() {
  var that = this, rBase = this.rBase, mBase = this.mBase, cur = this.cur;

  var get_zid = function() { return mBase.zids[cur["zid"]]; };

  // Compute zid and available transitions from sids, and add state to DFA.
  var cur_push = function(sids) {
   cur["idx"] = 0;
   cur["sids"] = sids;
   cur["cs"] = rBase.fa_avail_transits(sids);
   rBase.fa_phase_states(sids, PHASE_CUR);

   var z = sids_zip(sids);
   cur["zid"] = z;
   mBase.add_state(z, PHASE_CUR);
   if (rBase.fa_are_accept(cur["sids"])) mBase.nfa["accept"].push(mBase.zids[z]);
  };

  // Basically a breadth-first traversal from the initial state.
  if (this.phase == PHASE_OLD) /* Do nothing. */ ;
  else if (this.phase == PHASE_NEW) this.phase = PHASE_CUR;
  else if (mBase.nfa["initial"] == null) {
   cur_push([rBase.nfa["initial"]]);
   mBase.nfa["initial"] = get_zid();
  } else {
   this.refresh();
   if (cur["idx"] < cur["cs"].length) {
    // Mark current as old.
    rBase.fa_phase_states(cur["sids"], PHASE_OLD);
    mBase.add_state(cur["zid"], PHASE_OLD);

    // Do the transitition and marking.
    var c = cur["cs"][cur["idx"]];
    var z = sids_zip(rBase.fa_transit(cur["sids"], c, PHASE_CUR));
    // The queue of traversal grows here.
    mBase.add_state(z, PHASE_CUR);

    // Add and mark the transitition in DFA.
    var tr = mBase.nfa["states"][get_zid()]["transit"];
    tr[c] = {};
    tr[c][mBase.zids[z]] = PHASE_CUR;

    ++cur["idx"];
   } else if (mBase.queue.length != 0) {
    cur_push(sids_unzip(mBase.queue.shift()));
   } else this.phase = PHASE_OLD;
  }

  return this.get_snapshot();
 };
};

var tom_nfa_matcher = function(nfa) {
 this.rBase = new nfa_run_base(nfa);
 this.str = null;
 this.cur = null;
 this.phase = null;

 this.is_end = function() { return this.phase == PHASE_OLD; };

 this.get_snapshot = function() {
  return clone({
   "str": fmt_str(this.str, this.cur["idx"] - 1),
   "nfa": this.rBase.nfa,
   "status": this.is_match()
  });
 };

 this.refresh = function() { fa_phase(this.rBase.nfa, PHASE_NEW); };

 // Set the string to match.
 this.init = function(str) {
  this.str = str;
  this.cur = { "idx": -1, "sids": [], "end": false, "fail": false };
  this.phase = PHASE_NEW;
  this.refresh();
 };

 this.is_match = function() {
  return !this.cur["fail"] && this.rBase.fa_are_accept(this.cur["sids"]);
 };

 this.iter = function() {
  var rBase = this.rBase, cur = this.cur;
  if (this.phase == PHASE_OLD) /* Do nothing. */ ;
  else if (this.phase == PHASE_NEW) this.phase = PHASE_CUR;
  else {
   if (cur["end"]) {
    this.refresh();
    this.phase = PHASE_OLD;
   } else if (cur["idx"] == -1) {
    cur["sids"] = [rBase.nfa["initial"]];
    rBase.fa_phase_states(cur["sids"], PHASE_CUR);
    ++cur["idx"];
   } else {
    this.refresh();
    rBase.fa_phase_states(cur["sids"], PHASE_OLD);
    if (cur["idx"] >= this.str.length) cur["end"] = true;
    else if (!this.rBase.fa_can_transit(
     this.cur["sids"], this.str[this.cur["idx"]])
    ) {
     cur["end"] = true;
     cur["fail"] = true;
    } else {
     cur["sids"] = rBase.fa_transit(
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

var bt_nfae_matcher = function(nfae) {
 this.rBase = new nfa_run_base(nfae);
 this.str = null;
 this.cur = null;
 this.phase = null;

 this.is_end = function() { return this.phase == PHASE_OLD; };

 this.get_snapshot = function() {
  return clone({
   "str": fmt_str(this.str, this.cur["idx"] - 1),
   "nfae": this.rBase.nfa,
   "status": this.is_match()
  });
 };

 this.refresh = function() { fa_phase(this.rBase.nfa, PHASE_NEW); };

 this.init = function(str) {
  this.str = str;
  this.cur = { "idx": -1, "track": [], "end": false };
  this.phase = PHASE_NEW;
  this.refresh();
 };

 this.cur_head = function(n) {
  var track = this.cur["track"];
  return track[track.length - n];
 };

 this.get_sid = function() {
  return this.cur_head(1)["sid"];
 };

 this.is_match = function() {
  if (this.cur["idx"] == -1) return false;
  else return this.rBase.fa_is_accept(this.get_sid());
 };

 this.iter = function() {
  var that = this, rBase = this.rBase, cur = this.cur;

  // Set the phase of the stack head.
  var phase_head = function(ph) {
    rBase.fa_phase_states([that.get_sid()], ph);
  };

  // Set the phase of transition between the head and the one next to head.
  var phase_track = function(ph) {
   var t = that.cur_head(2);
   var f = t["transit"][t["fork"]];
   rBase.fa_phase_transit(t["sid"], f["c"], f["dest"], ph);
  };

  // Transit via f["c"] to f["dest"], and compute upcoming states.
  var cur_push = function(f) {
   var tr = rBase.nfa["states"][f["dest"]]["transit"];
   var t = { "sid": f["dest"], "transit": [], "fork": 0 };

   var push_transit = function(cc) {
    if (dict_has(tr, cc)) dict_keys(tr[cc]).sort(sid_cmp).map(function(d) {
     t["transit"].push({ "c": cc, "dest": d });
    });
   }

   if (f["c"] != "") ++cur["idx"];
   push_transit(that.str[cur["idx"]]);
   push_transit("");
   cur["track"].push(t);
  };

  var cur_pop = function() {
   cur["track"].pop();
   var t = that.cur_head(1);
   if (t["transit"][t["fork"]]["c"] != "") --cur["idx"];
   ++t["fork"];
  };

  // Basically a depth-first searching from the initial state.
  if (this.phase == PHASE_OLD) /* Do nothing. */ ;
  else if (this.phase == PHASE_NEW) this.phase = PHASE_CUR;
  else {
   if (cur["end"]) {
    this.refresh();
    this.phase = PHASE_OLD;
   } else if (cur["idx"] == -1) {
    cur_push({ "c": null, "dest": rBase.nfa["initial"] });
    phase_head(PHASE_CUR);
   } else {
    this.refresh();
    while (true) {
     var t = this.cur_head(1);
     if (cur["idx"] >= this.str.length && this.is_match()) {
      phase_head(PHASE_OLD);
      cur["end"] = true;
      ++cur["idx"];
      break;
     } else if (
      t["fork"] < t["transit"].length && cur["idx"] < this.str.length
     ) {
      var f = t["transit"][t["fork"]];
      phase_head(PHASE_OLD);
      cur_push(f);
      phase_head(PHASE_CUR);
      phase_track(PHASE_CUR);
      break;
     } else if (cur["track"].length < 2) {
      // Search failed.
      phase_head(PHASE_CUR);
      cur["end"] = true;
      break;
     } else {
      phase_head(PHASE_OLD);
      phase_track(PHASE_OLD);
      cur_pop();

      // Have a break on a forking state to ease view of the track.
      if (this.cur_head(1)["transit"].length > 1) {
       phase_head(PHASE_CUR);
       break;
      }
     }
    }
   }
  }

  return this.get_snapshot();
 };

 this.init("");
};

// -*- indent-tabs-mode: nil -*- vim:et:ts=1:sw=1
