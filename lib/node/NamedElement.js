"use strict";
exports.__esModule = true;
var util_1 = require("./util");
/**
 * A named element is a part of the state machine hierarchy.
 * @param TParent The type of the parent of the named element.
 */
var NamedElement = /** @class */ (function () {
    function NamedElement(name, parent) {
        var _this = this;
        this.name = name;
        this.parent = parent;
        this.qualifiedName = parent ? parent + "." + name : name;
        util_1.log.info(function () { return "Created " + _this; }, util_1.log.Create);
    }
    NamedElement.prototype.enter = function (instance, deepHistory, trigger) {
        this.enterHead(instance, deepHistory, trigger, undefined);
        this.enterTail(instance, deepHistory, trigger);
    };
    /**
     * Returns the fully qualified name of the named element.
     */
    NamedElement.prototype.toString = function () {
        return this.qualifiedName;
    };
    return NamedElement;
}());
exports.NamedElement = NamedElement;