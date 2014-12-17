// See `ast_node()' for the structure of an ast.

var grammar = {
 "lex": {
  "rules": [
   [ "\\?|\\*|\\||\\(|\\)",  "return yytext;" ],
   [ ".",                    "return 'CHR';" ],
   [ "$",                    "return 'EOL';" ]
  ]
 },

 "bnf": {
  "line": [
   [ "EOL",        "return ast_node('nil', []);" ],
   [ "alt EOL",    "return $1;" ]
  ],
  "alt": [
   [ "cat",        "$$ = $1;" ],
   [ "alt | cat",  "$$ = ast_node('|', [$1, $3]);" ]
  ],
  "cat": [
   [ "rep",        "$$ = $1;" ],
   [ "cat rep",    "$$ = ast_node('cat', [$1, $2]);" ]
  ],
  "rep": [
   [ "atom",       "$$ = $1;" ],
   [ "atom ?",     "$$ = ast_node('?', [$1]);" ],
   [ "atom *",     "$$ = ast_node('*', [$1]);" ]
  ],
  "atom": [
   [ "CHR",        "$$ = ast_node('chr', undefined, $1);" ],
   [ "( alt )",    "$$ = ast_node('sub', [$2]);" ]
  ]
 }
};

var parser = Jison.Generator(grammar, {type: "lalr"}).createParser();

var ast_node = function(type, children, info) {
 return { "type": type, "phase": PHASE_NEW, "children": children, "info": info };
};

// A post-order iterator of an ast.

var iter_ast = function(ast) {
 this.ast = clone(ast);
 this.phase = PHASE_NEW;
 this.cur = [];

 this.is_end = function() { return this.phase == PHASE_OLD; };

 this.visit = function() {
  var node = this.ast;
  for (var i = 0; i < this.cur.length; ++i) {
   if (i < 0) return null;
   else node = node["children"][this.cur[i]];
  }
  return node;
 };

 this.leftmost = function() {
  var node = this.visit();
  while (node["type"] != "chr" && node["type"] != "nil") {
   this.cur.push(0);
   node = node["children"][0];
  }
 };

 this.iter = function() {
  if (this.phase == PHASE_OLD) return;
  else if (this.phase == PHASE_NEW) {
   this.phase = PHASE_CUR;
   this.leftmost();
   this.visit()["phase"] = PHASE_CUR;
   return;
  } else this.visit()["phase"] = PHASE_OLD;

  if (this.cur.length == 0) this.phase = PHASE_OLD;
  else {
   var idx = this.cur.pop() + 1;
   if (idx < this.visit()["children"].length) {
    this.cur.push(idx);
    this.leftmost();
   }
   this.visit()["phase"] = PHASE_CUR;
  }
 };
};

var fmt_ast = function(ast) {
 var fmt_chr = function(c) { return [{ "txt": c, "phase": ast["phase"]}]; }
 var fmt_sub = function(i) { return fmt_ast(ast["children"][i]); };

 var my_conn = function(arr1, arr2) {
  var max1 = arr1.length - 1;
  var ph0 = ast["phase"], ph1 = arr1[max1]["phase"], ph2 = arr2[0]["phase"];
  if (ph0 == ph1 && ph0 == ph2) {
   return array_cat([
    arr1.slice(0, max1),
    [{ "txt": arr1[max1]["txt"] + arr2[0]["txt"], "phase": ph0 }],
    arr2.slice(1),
   ]);
  } else return arr1.concat(arr2);
 };

 var my_cat = function(arrs) {
  return arrs.reduce(
   function(arr1, arr2, _, __) { return my_conn(arr1, arr2); }
  );
 };

 switch (ast["type"]) {
  case "chr":
   return fmt_chr(ast["info"]);
  case "sub":
   return my_cat([fmt_chr("("), fmt_sub(0), fmt_chr(")")]);
  case "?": case "*":
   return my_cat([fmt_sub(0), fmt_chr(ast["type"])]);
  case "cat":
   return my_cat([fmt_sub(0), fmt_sub(1)]);
  case "|":
   return my_cat([fmt_sub(0), fmt_chr("|"), fmt_sub(1)]);
  case "nil":
   return fmt_chr("");
 }
};

// -*- indent-tabs-mode: nil -*- vim:et:ts=1:sw=1
