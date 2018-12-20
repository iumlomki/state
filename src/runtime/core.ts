import * as model from '../model';
import { assert, log } from '../util';
import { IInstance } from '../runtime';

/**
 * Passes a trigger event to a state machine instance for evaluation
 * @param state The state to evaluate the trigger event against.
 * @param instance The state machine instance to evaluate the trigger against.
 * @param deepHistory True if deep history semantics are invoked.
 * @param trigger The trigger event
 * @returns Returns true if the trigger was consumed by the state.
 * @hidden
 */
export function evaluate(state: model.State, instance: IInstance, deepHistory: boolean, trigger: any): boolean {
	const result = delegate(state, instance, deepHistory, trigger) || accept(state, instance, deepHistory, trigger) || defer(state, instance, trigger);

	// check completion transitions if the trigger caused as state transition and this state is still active
	if (result && state.parent && instance.getState(state.parent) === state) {
		completion(state, instance, deepHistory, state);
	}

	return result;
}

/** Delegate a trigger to children for evaluation */
function delegate(state: model.State, instance: IInstance, deepHistory: boolean, trigger: any): boolean {
	let result: boolean = false;

	// delegate to the current state of child regions for evaluation
	for (let i = state.children.length; i--;) {
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
function accept(vertex: model.Vertex, instance: IInstance, deepHistory: boolean, trigger: any): boolean {
	let result = false;

	const transition = vertex.getTransition(trigger);

	if (transition) {
		traverse(transition, instance, deepHistory, trigger);

		result = true;
	}

	return result;
}

/** Evaluates the trigger event against the list of deferred transitions and defers into the event pool if necessary. */
function defer(state: model.State, instance: IInstance, trigger: any): boolean {
	let result = false;

	if (state.deferrableTrigger.indexOf(trigger.constructor) !== -1) {
		instance.defer(state, trigger);

		result = true;
	}

	return result;
}

/** Traverse a transition */
function traverse(transition: model.Transition, instance: IInstance, deepHistory: boolean, trigger: any): void {
	const transitions: Array<model.Transition> = [transition];

	// gather all transitions to be taversed either side of static conditional branches (junctions)
	while (transition.target instanceof model.PseudoState && transition.target.kind === model.PseudoStateKind.Junction) {
		transitions.unshift(transition = transition.target.getTransition(trigger)!);
	}
	// traverse all transitions
	for (let i = transitions.length; i--;) {
		transitions[i].execute(instance, deepHistory, trigger);
	}
}

/** Checks for and executes completion transitions */
function completion(state: model.State, instance: IInstance, deepHistory: boolean, trigger: any): void {
	// check to see if the state is complete; fail fast if its not
	for (let i = state.children.length; i--;) {
		if (!instance.getState(state.children[i]).isFinal()) {
			return;
		}
	}

	// look for transitions
	accept(state, instance, deepHistory, trigger);
}

/**
 * Runtime extension methods to the NamedElement interface.
 * @internal
 */
declare module '../model/NamedElement' {
	interface NamedElement<TParent> {
		enter(instance: IInstance, deepHistory: boolean, trigger: any): void;
		enterHead(instance: IInstance, deepHistory: boolean, trigger: any, nextElement: model.NamedElement | undefined): void;
		enterTail(instance: IInstance, deepHistory: boolean, trigger: any): void;
		leave(instance: IInstance, deepHistory: boolean, trigger: any): void;
	}
}

/**
 * Runtime extension methods to the region class.
 * @internal
 */
declare module '../model/Region' {
	interface Region {
		enter(instance: IInstance, deepHistory: boolean, trigger: any): void;
		enterHead(instance: IInstance, deepHistory: boolean, trigger: any, nextElement: model.NamedElement | undefined): void;
		enterTail(instance: IInstance, deepHistory: boolean, trigger: any): void;
		leave(instance: IInstance, deepHistory: boolean, trigger: any): void;
	}
}

/** Enter a region, state or pseudo state */
model.Region.prototype.enter = model.State.prototype.enter = model.PseudoState.prototype.enter = function (instance: IInstance, deepHistory: boolean, trigger: any): void {
	this.enterHead(instance, deepHistory, trigger, undefined);
	this.enterTail(instance, deepHistory, trigger);
}

/** Initiate region entry */
model.Region.prototype.enterHead = function (instance: IInstance, deepHistory: boolean, trigger: any, nextElement: model.NamedElement | undefined): void {
	log.info(() => `${instance} enter ${this}`, log.Entry);
}

/** Complete region entry */
model.Region.prototype.enterTail = function (instance: IInstance, deepHistory: boolean, trigger: any): void {
	let current: model.State | undefined;
	let starting: model.Vertex | undefined = this.starting;

	// determine if history semantics are in play and the region has previously been entered then select the starting vertex accordingly
	if ((deepHistory || (this.starting && this.starting.isHistory())) && (current = instance.getState(this))) {
		starting = current;
		deepHistory = deepHistory || (this.starting!.kind === model.PseudoStateKind.DeepHistory);
	}

	assert.ok(starting, () => `${instance} no initial pseudo state found at ${this}`);

	// cascade the entry operation to the approriate child vertex
	starting!.enter(instance, deepHistory, trigger);
}

/** Leave a region */
model.Region.prototype.leave = function (instance: IInstance, deepHistory: boolean, trigger: any): void {
	// cascade the leave operation to the currently active child vertex
	instance.getVertex(this).leave(instance, deepHistory, trigger);

	log.info(() => `${instance} leave ${this}`, log.Exit);
}

/**
 * Runtime extension methods to the pseudo state class.
 * @internal
 */
declare module '../model/PseudoState' {
	interface PseudoState {
		enter(instance: IInstance, deepHistory: boolean, trigger: any): void;
		enterHead(instance: IInstance, deepHistory: boolean, trigger: any, nextElement: model.NamedElement | undefined): void;
		enterTail(instance: IInstance, deepHistory: boolean, trigger: any): void;
		leave(instance: IInstance, deepHistory: boolean, trigger: any): void;
	}
}

/** Initiate pseudo state entry */
model.PseudoState.prototype.enterHead = function (instance: IInstance, deepHistory: boolean, trigger: any, nextElement: model.NamedElement | undefined): void {
	log.info(() => `${instance} enter ${this}`, log.Entry);

	// update the current vertex of the parent region
	instance.setVertex(this);
}

/** Complete pseudo state entry */
model.PseudoState.prototype.enterTail = function (instance: IInstance, deepHistory: boolean, trigger: any): void {
	// a pseudo state must always have a completion transition (junction pseudo state completion occurs within the traverse method above)
	if (this.kind !== model.PseudoStateKind.Junction) {
		accept(this, instance, deepHistory, trigger);
	}
}

/** Leave a pseudo state */
model.PseudoState.prototype.leave = function (instance: IInstance, deepHistory: boolean, trigger: any): void {
	log.info(() => `${instance} leave ${this}`, log.Exit);
}

/**
 * Runtime extension methods to the state class.
 * @internal
 */
declare module '../model/State' {
	interface State {
		enter(instance: IInstance, deepHistory: boolean, trigger: any): void;
		enterHead(instance: IInstance, deepHistory: boolean, trigger: any, nextElement: model.NamedElement | undefined): void;
		enterTail(instance: IInstance, deepHistory: boolean, trigger: any): void;
		leave(instance: IInstance, deepHistory: boolean, trigger: any): void;
	}
}

/** Initiate state entry */
model.State.prototype.enterHead = function (instance: IInstance, deepHistory: boolean, trigger: any, nextElement: model.NamedElement | undefined): void {
	// when entering a state indirectly (part of the target ancestry in a transition that crosses region boundaries), ensure all child regions are entered
	if (nextElement) {
		// enter all child regions except for the next in the ancestry
		for (const region of this.children) {
			if (region !== nextElement) {
				region.enter(instance, deepHistory, trigger);
			}
		}
	}

	log.info(() => `${instance} enter ${this}`, log.Entry);

	// update the current state and vertex of the parent region
	instance.setState(this);

	// perform the user defined entry behaviour
	this.doEnter(trigger);
}

/** Complete state entry */
model.State.prototype.enterTail = function (instance: IInstance, deepHistory: boolean, trigger: any): void {
	// cascade the enter operation to child regions
	for (let i = this.children.length; i--;) {
		this.children[i].enter(instance, deepHistory, trigger);
	}

	// test for completion transitions
	completion(this, instance, deepHistory, this);
}

/** Leave a state */
model.State.prototype.leave = function (instance: IInstance, deepHistory: boolean, trigger: any): void {
	// cascade the leave operation to all child regions
	for (var i = this.children.length; i--;) {
		this.children[i].leave(instance, deepHistory, trigger);
	}

	log.info(() => `${instance} leave ${this}`, log.Exit);

	// perform the user defined leave behaviour
	this.doLeave(trigger);
}

/**
 * Runtime extension methods to the transition class.
 * @internal
 */
declare module '../model/Transition' {
	interface Transition<TTrigger> {
		execute(instance: IInstance, deepHistory: boolean, trigger: any): void;
	}
}

/** Traverse an external or local transition */
model.Transition.prototype.execute = function (instance: IInstance, deepHistory: boolean, trigger: any): void {
	log.info(() => `Executing ${this}`, log.Transition);

	// leave elements below the common ancestor
	this.activation.exitSource(instance, deepHistory, trigger);

	// perform the transition behaviour
	this.doActions(trigger);

	// enter elements below the common ancestor to the target
	this.activation.enterTarget(instance, deepHistory, trigger);
}


/**
 * Runtime extension methods to the TransitionActivation classes.
 * @internal
 */
declare module '../model/TransitionActivation' {
	interface TransitionActivation {
		exitSource(instance: IInstance, deepHistory: boolean, trigger: any): void;
		enterTarget(instance: IInstance, deepHistory: boolean, trigger: any): void;
	}

	interface ExternalTransitionActivation {
		exitSource(instance: IInstance, deepHistory: boolean, trigger: any): void;
		enterTarget(instance: IInstance, deepHistory: boolean, trigger: any): void;
	}

	interface LocalTransitionActivation {
		exitSource(instance: IInstance, deepHistory: boolean, trigger: any): void;
		enterTarget(instance: IInstance, deepHistory: boolean, trigger: any): void;
	}

	interface InternalTransitionActivation {
		exitSource(instance: IInstance, deepHistory: boolean, trigger: any): void;
		enterTarget(instance: IInstance, deepHistory: boolean, trigger: any): void;
	}
}

model.ExternalTransitionActivation.prototype.exitSource = function (instance: IInstance, deepHistory: boolean, trigger: any): void {
	// exit the element below the common ancestor
	this.toExit.leave(instance, deepHistory, trigger);
}

model.ExternalTransitionActivation.prototype.enterTarget = function (instance: IInstance, deepHistory: boolean, trigger: any): void {
	// enter elements below the common ancestor to the target
	for (var i = this.toEnter.length; i--;) {
		this.toEnter[i].enterHead(instance, deepHistory, trigger, this.toEnter[i - 1]);
	}

	// cascade the entry action to any child elements of the target
	this.toEnter[0].enterTail(instance, deepHistory, trigger);
}

model.LocalTransitionActivation.prototype.exitSource = function (instance: IInstance, deepHistory: boolean, trigger: any): void {
	this.vertexToEnter = this.target;

	// iterate towards the root until we find an active state
	while (this.vertexToEnter.parent && !isActive(this.vertexToEnter.parent.parent, instance)) {
		this.vertexToEnter = this.vertexToEnter.parent.parent;
	}

	// exit the currently active vertex in the target vertex's parent region
	if (!isActive(this.vertexToEnter, instance) && this.vertexToEnter.parent) {
		instance.getVertex(this.vertexToEnter.parent).leave(instance, deepHistory, trigger);
	}
}

model.LocalTransitionActivation.prototype.enterTarget = function (instance: IInstance, deepHistory: boolean, trigger: any): void {
	if (this.vertexToEnter && !isActive(this.vertexToEnter, instance)) {
		this.vertexToEnter!.enter(instance, deepHistory, trigger);
	}
}

model.InternalTransitionActivation.prototype.exitSource = function (instance: IInstance, deepHistory: boolean, trigger: any): void {
	// don't exit anything
}

model.InternalTransitionActivation.prototype.enterTarget = function (instance: IInstance, deepHistory: boolean, trigger: any): void {
	// test for completion transitions for internal transitions as there will be state entry/exit performed where the test is usually performed
	completion(this.source, instance, deepHistory, this.source);
}

//function isRegionActive(region: model.Region, instance: IInstance): boolean {
//	return isVertexActive(region.parent, instance);
//}

function isActive(vertex: model.Vertex, instance: IInstance): boolean {
	return vertex.parent ? isActive(vertex.parent.parent, instance) && instance.getVertex(vertex.parent) === vertex : true;
}
