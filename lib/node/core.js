"use strict";
exports.__esModule = true;
var util_1 = require("./util");
var PseudoStateKind_1 = require("./PseudoStateKind");
var State_1 = require("./State");
var PseudoState_1 = require("./PseudoState");
var Region_1 = require("./Region");
var Transition_1 = require("./Transition");
var TransitionActivation_1 = require("./TransitionActivation");
/**
 * Passes a trigger event to a state machine instance for evaluation
 * @param state The state to evaluate the trigger event against.
 * @param instance The state machine instance to evaluate the trigger against.
 * @param deepHistory True if deep history semantics are invoked.
 * @param trigger The trigger event
 * @returns Returns true if the trigger was consumed by the state.
 * @hidden
 */
function evaluate(state, instance, deepHistory, trigger) {
    var result = delegate(state, instance, deepHistory, trigger) || accept(state, instance, deepHistory, trigger) || defer(state, instance, trigger);
    // check completion transitions if the trigger caused as state transition and this state is still active
    if (result && state.parent && instance.getState(state.parent) === state) {
        completion(state, instance, deepHistory, state);
    }
    return result;
}
exports.evaluate = evaluate;
/** Delegate a trigger to children for evaluation */
function delegate(state, instance, deepHistory, trigger) {
    var result = false;
    // delegate to the current state of child regions for evaluation
    for (var i = state.children.length; i--;) {
        if (evaluate(instance.getState(state.children[i]), instance, deepHistory, trigger)) {
            result = true;
            // if a transition in a child state causes us to exit this state, break out now 
            if (state.parent && instance.getState(state.parent) !== state) {
                break;
            }
        }
    }
    return result;
}
/** Accept a trigger and vertex: evaluate the guard conditions of the transitions and traverse if one evaluates true. */
function accept(vertex, instance, deepHistory, trigger) {
    var result = false;
    var transition = vertex.getTransition(trigger);
    if (transition) {
        traverse(transition, instance, deepHistory, trigger);
        result = true;
    }
    return result;
}
/** Evaluates the trigger event against the list of deferred transitions and defers into the event pool if necessary. */
function defer(state, instance, trigger) {
    var result = false;
    if (state.deferrableTrigger.indexOf(trigger.constructor) !== -1) {
        instance.defer(state, trigger);
        result = true;
    }
    return result;
}
/** Traverse a transition */
function traverse(transition, instance, deepHistory, trigger) {
    var transitions = [transition];
    // gather all transitions to be taversed either side of static conditional branches (junctions)
    while (transition.target instanceof PseudoState_1.PseudoState && transition.target.kind === PseudoStateKind_1.PseudoStateKind.Junction) {
        transitions.unshift(transition = transition.target.getTransition(trigger));
    }
    // traverse all transitions
    for (var i = transitions.length; i--;) {
        transitions[i].execute(instance, deepHistory, trigger);
    }
}
/** Checks for and executes completion transitions */
function completion(state, instance, deepHistory, trigger) {
    // check to see if the state is complete; fail fast if its not
    for (var i = state.children.length; i--;) {
        if (!instance.getState(state.children[i]).isFinal()) {
            return;
        }
    }
    // look for transitions
    accept(state, instance, deepHistory, trigger);
}
/** Enter a region, state or pseudo state */
Region_1.Region.prototype.enter = State_1.State.prototype.enter = PseudoState_1.PseudoState.prototype.enter = function (instance, deepHistory, trigger) {
    this.enterHead(instance, deepHistory, trigger, undefined);
    this.enterTail(instance, deepHistory, trigger);
};
/** Initiate region entry */
Region_1.Region.prototype.enterHead = function (instance, deepHistory, trigger, nextElement) {
    var _this = this;
    util_1.log.info(function () { return instance + " enter " + _this; }, util_1.log.Entry);
};
/** Complete region entry */
Region_1.Region.prototype.enterTail = function (instance, deepHistory, trigger) {
    var _this = this;
    var current;
    var starting = this.starting;
    // determine if history semantics are in play and the region has previously been entered then select the starting vertex accordingly
    if ((deepHistory || (this.starting && this.starting.isHistory())) && (current = instance.getState(this))) {
        starting = current;
        deepHistory = deepHistory || (this.starting.kind === PseudoStateKind_1.PseudoStateKind.DeepHistory);
    }
    util_1.assert.ok(starting, function () { return instance + " no initial pseudo state found at " + _this; });
    // cascade the entry operation to the approriate child vertex
    starting.enter(instance, deepHistory, trigger);
};
/** Leave a region */
Region_1.Region.prototype.leave = function (instance, deepHistory, trigger) {
    var _this = this;
    // cascade the leave operation to the currently active child vertex
    instance.getVertex(this).leave(instance, deepHistory, trigger);
    util_1.log.info(function () { return instance + " leave " + _this; }, util_1.log.Exit);
};
/** Initiate pseudo state entry */
PseudoState_1.PseudoState.prototype.enterHead = function (instance, deepHistory, trigger, nextElement) {
    var _this = this;
    util_1.log.info(function () { return instance + " enter " + _this; }, util_1.log.Entry);
    // update the current vertex of the parent region
    instance.setVertex(this);
};
/** Complete pseudo state entry */
PseudoState_1.PseudoState.prototype.enterTail = function (instance, deepHistory, trigger) {
    // a pseudo state must always have a completion transition (junction pseudo state completion occurs within the traverse method above)
    if (this.kind !== PseudoStateKind_1.PseudoStateKind.Junction) {
        accept(this, instance, deepHistory, trigger);
    }
};
/** Leave a pseudo state */
PseudoState_1.PseudoState.prototype.leave = function (instance, deepHistory, trigger) {
    var _this = this;
    util_1.log.info(function () { return instance + " leave " + _this; }, util_1.log.Exit);
};
/** Initiate state entry */
State_1.State.prototype.enterHead = function (instance, deepHistory, trigger, nextElement) {
    var _this = this;
    // when entering a state indirectly (part of the target ancestry in a transition that crosses region boundaries), ensure all child regions are entered
    if (nextElement) {
        // enter all child regions except for the next in the ancestry
        for (var i = this.children.length; i--;) {
            if (this.children[i] !== nextElement) {
                this.children[i].enter(instance, deepHistory, trigger);
            }
        }
    }
    util_1.log.info(function () { return instance + " enter " + _this; }, util_1.log.Entry);
    // update the current state and vertex of the parent region
    instance.setState(this);
    // perform the user defined entry behaviour
    for (var i = this.onEnter.length; i--;) {
        this.onEnter[i](trigger);
    }
};
/** Complete state entry */
State_1.State.prototype.enterTail = function (instance, deepHistory, trigger) {
    // cascade the enter operation to child regions
    for (var i = this.children.length; i--;) {
        this.children[i].enter(instance, deepHistory, trigger);
    }
    // test for completion transitions
    completion(this, instance, deepHistory, this);
};
/** Leave a state */
State_1.State.prototype.leave = function (instance, deepHistory, trigger) {
    var _this = this;
    // cascade the leave operation to all child regions
    for (var i = this.children.length; i--;) {
        this.children[i].leave(instance, deepHistory, trigger);
    }
    util_1.log.info(function () { return instance + " leave " + _this; }, util_1.log.Exit);
    // perform the user defined leave behaviour
    for (var i_1 = this.onLeave.length; i_1--;) {
        this.onLeave[i_1](trigger);
    }
};
/** Traverse an external or local transition */
Transition_1.Transition.prototype.execute = function (instance, deepHistory, trigger) {
    var _this = this;
    util_1.log.info(function () { return "Executing " + _this; }, util_1.log.Transition);
    // leave elements below the common ancestor
    this.activation.exitSource(instance, deepHistory, trigger);
    // perform the transition behaviour
    this.doActions(trigger);
    // enter elements below the common ancestor to the target
    this.activation.enterTarget(instance, deepHistory, trigger);
};
TransitionActivation_1.ExternalTransitionActivation.prototype.exitSource = function (instance, deepHistory, trigger) {
    // exit the element below the common ancestor
    this.toExit.leave(instance, deepHistory, trigger);
};
TransitionActivation_1.ExternalTransitionActivation.prototype.enterTarget = function (instance, deepHistory, trigger) {
    // enter elements below the common ancestor to the target
    for (var i = this.toEnter.length; i--;) {
        this.toEnter[i].enterHead(instance, deepHistory, trigger, this.toEnter[i - 1]);
    }
    // cascade the entry action to any child elements of the target
    this.toEnter[0].enterTail(instance, deepHistory, trigger);
};
TransitionActivation_1.LocalTransitionActivation.prototype.exitSource = function (instance, deepHistory, trigger) {
    this.vertexToEnter = this.target;
    // iterate towards the root until we find an active state
    while (this.vertexToEnter.parent && !isActive(this.vertexToEnter.parent.parent, instance)) {
        this.vertexToEnter = this.vertexToEnter.parent.parent;
    }
    // exit the currently active vertex in the target vertex's parent region
    if (!isActive(this.vertexToEnter, instance) && this.vertexToEnter.parent) {
        instance.getVertex(this.vertexToEnter.parent).leave(instance, deepHistory, trigger);
    }
};
TransitionActivation_1.LocalTransitionActivation.prototype.enterTarget = function (instance, deepHistory, trigger) {
    if (this.vertexToEnter && !isActive(this.vertexToEnter, instance)) {
        this.vertexToEnter.enter(instance, deepHistory, trigger);
    }
};
TransitionActivation_1.InternalTransitionActivation.prototype.exitSource = function (instance, deepHistory, trigger) {
    // don't exit anything
};
TransitionActivation_1.InternalTransitionActivation.prototype.enterTarget = function (instance, deepHistory, trigger) {
    // test for completion transitions for internal transitions as there will be state entry/exit performed where the test is usually performed
    completion(this.source, instance, deepHistory, this.source);
};
function isActive(vertex, instance) {
    return vertex.parent ? isActive(vertex.parent.parent, instance) && instance.getVertex(vertex.parent) === vertex : true;
}
