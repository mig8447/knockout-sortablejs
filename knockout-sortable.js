/*global ko*/

(function (factory) {
    "use strict";
    //get ko ref via global or require
    var koRef;
    if (typeof ko !== 'undefined') {
        //global ref already defined
        koRef = ko;
    }
    else if (typeof require === 'function' && typeof exports === 'object' && typeof module === 'object') {
        //commonjs / node.js
        koRef = require('knockout');
    }
    //get sortable ref via global or require
    var sortableRef;
    if (typeof Sortable !== 'undefined') {
        //global ref already defined
        sortableRef = Sortable;
    }
    else if (typeof require === 'function' && typeof exports === 'object' && typeof module === 'object') {
        //commonjs / node.js
        sortableRef = require('sortablejs');
    }
    //use references if we found them
    if (koRef !== undefined && sortableRef !== undefined) {
        factory(koRef, sortableRef);
    }
    //if both references aren't found yet, get via AMD if available
    else if (typeof define === 'function' && define.amd) {
        //we may have a reference to only 1, or none
        if (koRef !== undefined && sortableRef === undefined) {
            define(['./Sortable'], function (amdSortableRef) {
                factory(koRef, amdSortableRef);
            });
        }
        else if (koRef === undefined && sortableRef !== undefined) {
            define(['knockout'], function (amdKnockout) {
                factory(amdKnockout, sortableRef);
            });
        }
        else if (koRef === undefined && sortableRef === undefined) {
            define(['knockout', './Sortable'], factory);
        }
    }
    //no more routes to get references
    else {
        //report specific error
        if (koRef !== undefined && sortableRef === undefined) {
            throw new Error('knockout-sortable could not get reference to Sortable');
        }
        else if (koRef === undefined && sortableRef !== undefined) {
            throw new Error('knockout-sortable could not get reference to Knockout');
        }
        else if (koRef === undefined && sortableRef === undefined) {
            throw new Error('knockout-sortable could not get reference to Knockout or Sortable');
        }
    }
})(function (ko, Sortable) {
    "use strict";

    var init = function (element, valueAccessor, allBindings, viewModel, bindingContext, sortableOptions) {

        var options = buildOptions(valueAccessor, sortableOptions, element, allBindings, viewModel, bindingContext);

        element._knockout_sortablejs = Sortable.create(element, options);

        // Destroy the sortable if knockout disposes the element it's connected to
        ko.utils.domNodeDisposal.addDisposeCallback(element, function () {
            element._knockout_sortablejs.destroy();
        });
        return ko.bindingHandlers.template.init(element, valueAccessor);
    },
    update = function (element, valueAccessor, allBindings, viewModel, bindingContext, sortableOptions) {
        // There seems to be some problems with updating the options of a sortable
        // Tested to change eventhandlers and the group options without any luck

        var options = buildOptions(valueAccessor, sortableOptions, element, allBindings, viewModel, bindingContext);

        for (var optionName in options) {
            element._knockout_sortablejs.option(optionName, options[optionName]);
        }

        return ko.bindingHandlers.template.update(element, valueAccessor, allBindings, viewModel, bindingContext);
    },
    eventHandlers = (function (handlers) {
        var moveOperations = [],
            tryMoveOperation = function ( e, itemVM, parentVM, collection, parentBindings, sortableOptions ) {
                // A move operation is the combination of a add and remove event,
                // this is to make sure that we have both the target and origin collections
                var currentOperation = { event: e, itemVM: itemVM, parentVM: parentVM, collection: collection, parentBindings: parentBindings },
                    existingOperation = moveOperations.filter(function (op) {
                        return op.itemVM === currentOperation.itemVM;
                    })[0];

                if (!existingOperation) {
                    moveOperations.push(currentOperation);
                }
                else {
                    // We're finishing the operation and already have a handle on
                    // the operation item meaning that it's safe to remove it
                    moveOperations.splice(moveOperations.indexOf(existingOperation), 1);

                    var removeOperation = currentOperation.event.type === 'remove' ? currentOperation : existingOperation,
                        addOperation = currentOperation.event.type === 'add' ? currentOperation : existingOperation;

                    addOperation.event.groupOption = parentBindings.sortable.options.group;

                    moveItem( itemVM, removeOperation.collection, addOperation.collection, addOperation.event.clone, addOperation.event, sortableOptions );
                }
            },
            // Moves an item from the "from" collection to the "to" collection, these
            // can be references to the same collection which means it's a sort.
            // clone indicates if we should move or copy the item into the new collection
            moveItem = function( itemVM, from, to, clone, e, sortableOptions ) {
                var fromArray = from(),
                    toArray = to(),
                    // It's not certain that the items actual index is the same
                    // as the index reported by sortable due to filtering etc.
                    originalIndex = fromArray.indexOf( itemVM ),
                    newIndex = e.newIndex;

                // We have to find out the actual desired index of the to array,
                // as this might be a computed array. We could otherwise potentially
                // drop an item above the 3rd visible item, but the 2nd visible item
                // has an actual index of 5.
                if ( e.item.previousElementSibling ) {
                    newIndex = toArray.indexOf( ko.dataFor( e.item.previousElementSibling ) );
                    // NOTE: If moving to a lower index (move up) we add one to
                    //       the new index, so that the calculation is done
                    //       correctly
                    if ( newIndex < originalIndex ) newIndex++;
                }

                // NOTE: If we don't do this, even when re-render is not
                //       triggered, the node is eventually removed by ko
                e.item.parentNode.removeChild( e.item );

                // This splice is necessary for both clone and move/sort
                // - In sort/move since it shouldn't be at this index/in this array anymore
                // - In clone since we have to work around knockouts valueHasMutated
                //   when manipulating arrays and avoid a "unbound" item added by sortable
                // NOTE: Remove the item from the original array. The value is
                //       saved in the itemVM variable
                fromArray.splice( originalIndex, 1 );

                // See the option at https://github.com/SortableJS/Sortable#options
                // group: { name: 'shared', pull: 'clone' }
                var cloneable = typeof e.groupOption === 'object' && e.groupOption.pull === 'clone';

                if ( cloneable && clone && from !== to ) {
                    // NOTE: Since this is a clone operation, add the item to
                    //       where it was
                    fromArray.splice( originalIndex, 0, itemVM );
                } else {
                    // NOTE: We only notify the mutation to from in here because
                    //       we did not add the element back above. This is
                    //       equivalent to valueHasMutated but prevents errors
                    //       when dealing with computeds
                    from.notifySubscribers( fromArray, 'spectate' );
                    from.notifySubscribers( fromArray );
                }

                // Force deferred tasks to run now, registering the removal
                // NOTE: If this is not done, even when re-rendering is not
                //       forced, ko's cleanup process removes the node later
                ko.tasks.runEarly();

                // Insert the item on its new position
                toArray.splice( newIndex, 0, itemVM );
                to.notifySubscribers( toArray, 'spectate' );
                to.notifySubscribers( toArray );

                // NOTE: This is not required since its execution can be
                //       deferred, however, this helps to run any array
                //       subscriptions before the onEnd event is executed, which
                //       in turn allows for movement detection
                ko.tasks.runEarly();
            };

        handlers.onRemove = tryMoveOperation;
        handlers.onAdd = tryMoveOperation;
        handlers.onUpdate = function ( e, itemVM, parentVM, collection, parentBindings, sortableOptions ) {
            // This will be performed as a sort since the to/from collections
            // reference the same collection and clone is set to false
            moveItem( itemVM, collection, collection, false, e, sortableOptions );
        };

        return handlers;
    })({}),
    // bindingOptions are the options set in the "data-bind" attribute in the ui.
    // options are custom options, for instance draggable/sortable specific options
    buildOptions = function (bindingOptions, options, element, allBindings, viewModel, bindingContext) {
        // deep clone/copy of properties from the "from" argument onto
        // the "into" argument and returns the modified "into"
        var merge = function (into, from) {
            for (var prop in from) {
                if (Object.prototype.toString.call(from[prop]) === '[object Object]') {
                    if (Object.prototype.toString.call(into[prop]) !== '[object Object]') {
                        into[prop] = {};
                    }
                    into[prop] = merge(into[prop], from[prop]);
                }
                else
                    into[prop] = from[prop];
            }

            return into;
        },
        // unwrap the supplied options
        unwrappedOptions = ko.utils.peekObservable(bindingOptions()).options || {};

        // Make sure that we don't modify the provided settings object
        options = merge({}, options);

        // group is handled differently since we should both allow to change
        // a draggable to a sortable (and vice versa), but still be able to set
        // a name on a draggable without it becoming a drop target.
        if (unwrappedOptions.group && Object.prototype.toString.call(unwrappedOptions.group) !== '[object Object]') {
            // group property is a name string declaration, convert to object.
            unwrappedOptions.group = { name: unwrappedOptions.group };
        }

        let result = merge(options, unwrappedOptions);
        // It's seems that we cannot update the eventhandlers after we've created
        // the sortable, so define them in init instead of update
        [ 'onStart', 'onEnd', 'onRemove', 'onAdd', 'onUpdate', 'onSort', 'onFilter', 'onMove', 'onClone' ].forEach( function (e) {
            if (result[e] || eventHandlers[e]) {
                let eventType = e,
                    parentVM = viewModel,
                    parentBindings = allBindings,
                    handler = result[e];

                result[e] = function (e) {
                    var itemVM = ko.dataFor(e.item),
                        // All of the bindings on the parent element
                        bindings = ko.utils.peekObservable( parentBindings() ),
                        // The binding options for the draggable/sortable binding of the parent element
                        bindingHandlerBinding = bindings.sortable || bindings.draggable,
                        // The collection that we should modify
                        collection = bindingHandlerBinding.collection || bindingHandlerBinding.foreach;
                    if (handler) {
                        let result = handler(e, itemVM, parentVM, collection, bindings, options);
                        if ( eventType === 'onMove' && typeof result !== 'undefined' ) return result;
                    }
                    if (eventHandlers[eventType])
                        // NOTE: The eventHandlers array doesn't have an onMove handler
                        eventHandlers[eventType](e, itemVM, parentVM, collection, bindings, options);
                };
            }
        });

        return result;
    };

    ko.bindingHandlers.draggable = {
        sortableOptions: {
            group: { pull: 'clone', put: false },
            sort: false
        },
        init: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
            return init(element, valueAccessor, allBindings, viewModel, bindingContext, ko.bindingHandlers.draggable.sortableOptions);
        },
        update: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
            return update(element, valueAccessor, allBindings, viewModel, bindingContext, ko.bindingHandlers.draggable.sortableOptions);
        }
    };

    ko.bindingHandlers.sortable = {
        sortableOptions: {
            group: { pull: true, put: true }
        },
        init: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
            return init(element, valueAccessor, allBindings, viewModel, bindingContext, ko.bindingHandlers.sortable.sortableOptions);
        },
        update: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
            return update(element, valueAccessor, allBindings, viewModel, bindingContext, ko.bindingHandlers.sortable.sortableOptions);
        }
    };
});
