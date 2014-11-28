Terminology
-----------

* state: a transition state.
* snapshot: state of an entire automaton.
* phase: the phase of something being processed (cf. `PHASE_*` from `utils.js`).


Frequently used abbreviations
-----------------------------

* `ast`: an abstract syntax tree.
* `fa`: a finite automaton.
* `ex`: (e)xtra interim info about an `fa` (cf. `nfae_maker` from `fa.js`).
* `faex`: an `fa` and its `ex`.
* `cur`: current.
* `ph`: a phase.
* `eclose`: an epsilon-closure.
* `cat`: concatenation.
* `sid`: an ID string.
* `zid`: zipped ID strings (cf. `sids_[un]zip()` from `utils.js`).
* `fas`, `exs`, `sids`, ...: usually an array of `fa`, `ex`. `sid`, ...


Why not use RPN directly
------------------------

The reason for not directly converting the regular expression to an RPN and
evaluating it on the stack is that writing that by hand can be error-prone, and
more difficult if we want to support more complex features found in real world
regular expressions.  Using a parser generator makes maintaince and extension
of supported grammar much easier to reason.


Structure of an `fa`
--------------------

```
{
 "initial": sid_of_initial_state,
 "accept": [sid_of_accept_states],
 "states": [state]
}
```
where a state is

```
{ sid_of_state: description_of_state }
```

where description of a state is

```
{
 "transit": [transitition],
 "phase": phase
}
```

where a transitition is

```
{ character_of_transit: phase_of_transit }
```

