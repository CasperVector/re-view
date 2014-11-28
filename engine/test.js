(function() {
 var re = "a(b*c*|c*b*)?d", str = "abcd";

 var ast = parser.parse(re);
 dbg1(ast);

 document.write("\n");
 var maker1 = new nfae_maker(ast), nfae;
 while (true) {
  var result = maker1.iter();
  dbg1(fmt_ast(result["ast"]));
  dbg1(result["fas"]);
  if (maker1.is_end()) {
   nfae = result["fas"][0];
   break;
  }
 }

 document.write("\n");
 var base = new nfae_base(nfae);
 dbg1(dict_keys(base.nfae.states).map(function(s) {
  var d = {};
  d[s] = base.fa_ecloses([s], PHASE_OLD);
  return d;
 }));

 document.write("\n");
 var maker2 = new dfa_maker(nfae), dfa;
 while (true) {
  var result = maker2.iter();
  dbg1(result["nfae"]);
  dbg1(result["dfa"]);
  if (maker2.is_end()) {
   dfa = result["dfa"];
   break;
  }
 }

 document.write("\n");
 var matcher1 = new tom_nfae_matcher(nfae);
 matcher1.init(str);
 while (true) {
  var result = matcher1.iter();
  dbg1([result["str"], result["status"]]);
  dbg1(result["nfae"]);
  if (matcher1.is_end()) break;
 }

 document.write("\n");
 var matcher2 = new tom_nfae_matcher(dfa);
 matcher2.init(str);
 while (true) {
  var result = matcher2.iter();
  dbg1([result["str"], result["status"]]);
  dbg1(result["nfae"]);
  if (matcher2.is_end()) break;
 }
})();

// -*- indent-tabs-mode: nil -*- vim:et:ts=1:sw=1
