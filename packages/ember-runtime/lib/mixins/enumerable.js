/**
@module ember
@submodule ember-runtime
*/

// ..........................................................
// HELPERS
//

import Ember from 'ember-metal/core';
import { get } from 'ember-metal/property_get';
import { set } from 'ember-metal/property_set';
import {
  Mixin,
  aliasMethod
} from 'ember-metal/mixin';
import { indexOf } from 'ember-metal/enumerable_utils';
import { computed } from 'ember-metal/computed';
import {
  propertyWillChange,
  propertyDidChange
} from 'ember-metal/property_events';
import {
  addListener,
  removeListener,
  sendEvent,
  hasListeners
} from 'ember-metal/events';
import compare from 'ember-runtime/compare';

var contexts = [];

function popCtx() {
  return contexts.length === 0 ? {} : contexts.pop();
}

function pushCtx(ctx) {
  contexts.push(ctx);
  return null;
}

function iter(key, value) {
  var valueProvided = arguments.length === 2;

  function i(item) {
    var cur = get(item, key);
    return valueProvided ? value === cur : !!cur;
  }

  return i;
}

/**
  This mixin defines the common interface implemented by enumerable objects
  in Ember. Most of these methods follow the standard Array iteration
  API defined up to JavaScript 1.8 (excluding language-specific features that
  cannot be emulated in older versions of JavaScript).

  This mixin is applied automatically to the Array class on page load, so you
  can use any of these methods on simple arrays. If Array already implements
  one of these methods, the mixin will not override them.

  ## Writing Your Own Enumerable

  To make your own custom class enumerable, you need two items:

  1. You must have a length property. This property should change whenever
     the number of items in your enumerable object changes. If you use this
     with an `Ember.Object` subclass, you should be sure to change the length
     property using `set().`

  2. You must implement `nextObject().` See documentation.

  Once you have these two methods implemented, apply the `Ember.Enumerable` mixin
  to your class and you will be able to enumerate the contents of your object
  like any other collection.

  ## Using Ember Enumeration with Other Libraries

  Many other libraries provide some kind of iterator or enumeration like
  facility. This is often where the most common API conflicts occur.
  Ember's API is designed to be as friendly as possible with other
  libraries by implementing only methods that mostly correspond to the
  JavaScript 1.8 API.

  @class Enumerable
  @namespace Ember
  @since Ember 0.9
  @private
*/
export default Mixin.create({

  /**
    __Required.__ You must implement this method to apply this mixin.

    Implement this method to make your class enumerable.

    This method will be called repeatedly during enumeration. The index value
    will always begin with 0 and increment monotonically. You don't have to
    rely on the index value to determine what object to return, but you should
    always check the value and start from the beginning when you see the
    requested index is 0.

    The `previousObject` is the object that was returned from the last call
    to `nextObject` for the current iteration. This is a useful way to
    manage iteration if you are tracing a linked list, for example.

    Finally the context parameter will always contain a hash you can use as
    a "scratchpad" to maintain any other state you need in order to iterate
    properly. The context object is reused and is not reset between
    iterations so make sure you setup the context with a fresh state whenever
    the index parameter is 0.

    Generally iterators will continue to call `nextObject` until the index
    reaches the current length-1. If you run out of data before this
    time for some reason, you should simply return undefined.

    The default implementation of this method simply looks up the index.
    This works great on any Array-like objects.

    @method nextObject
    @param {Number} index the current index of the iteration
    @param {Object} previousObject the value returned by the last call to
      `nextObject`.
    @param {Object} context a context object you can use to maintain state.
    @return {Object} the next object in the iteration or undefined
    @private
  */
  nextObject: null,

  /**
    Helper method returns the first object from a collection. This is usually
    used by bindings and other parts of the framework to extract a single
    object if the enumerable contains only one item.

    If you override this method, you should implement it so that it will
    always return the same value each time it is called. If your enumerable
    contains only one object, this method should always return that object.
    If your enumerable is empty, this method should return `undefined`.

    ```javascript
    var arr = ['a', 'b', 'c'];
    arr.get('firstObject');  // 'a'

    var arr = [];
    arr.get('firstObject');  // undefined
    ```

    @property firstObject
    @return {Object} the object or undefined
    @public
  */
  firstObject: computed('[]', function() {
    if (get(this, 'length') === 0) {
      return undefined;
    }

    // handle generic enumerables
    var context = popCtx();
    var ret = this.nextObject(0, null, context);

    pushCtx(context);

    return ret;
  }),

  /**
    Helper method returns the last object from a collection. If your enumerable
    contains only one object, this method should always return that object.
    If your enumerable is empty, this method should return `undefined`.

    ```javascript
    var arr = ['a', 'b', 'c'];
    arr.get('lastObject');  // 'c'

    var arr = [];
    arr.get('lastObject');  // undefined
    ```

    @property lastObject
    @return {Object} the last object or undefined
    @private
  */
  lastObject: computed('[]', function() {
    var len = get(this, 'length');

    if (len === 0) {
      return undefined;
    }

    var context = popCtx();
    var idx = 0;
    var last = null;
    var cur;

    do {
      last = cur;
      cur = this.nextObject(idx++, last, context);
    } while (cur !== undefined);

    pushCtx(context);

    return last;
  }),

  /**
    Returns `true` if the passed object can be found in the receiver. The
    default version will iterate through the enumerable until the object
    is found. You may want to override this with a more efficient version.

    ```javascript
    var arr = ['a', 'b', 'c'];

    arr.contains('a'); // true
    arr.contains('z'); // false
    ```

    @method contains
    @param {Object} obj The object to search for.
    @return {Boolean} `true` if object is found in enumerable.
    @public
  */
  contains(obj) {
    var found = this.find(function(item) {
      return item === obj;
    });

    return found !== undefined;
  },

  /**
    Iterates through the enumerable, calling the passed function on each
    item. This method corresponds to the `forEach()` method defined in
    JavaScript 1.6.

    The callback method you provide should have the following signature (all
    parameters are optional):

    ```javascript
    function(item, index, enumerable);
    ```

    - `item` is the current item in the iteration.
    - `index` is the current index in the iteration.
    - `enumerable` is the enumerable object itself.

    Note that in addition to a callback, you can also pass an optional target
    object that will be set as `this` on the context. This is a good way
    to give your iterator function access to the current object.

    @method forEach
    @param {Function} callback The callback to execute
    @param {Object} [target] The target object to use
    @return {Object} receiver
    @private
  */
  forEach(callback, target) {
    if (typeof callback !== 'function') {
      throw new TypeError();
    }

    var context = popCtx();
    var len = get(this, 'length');
    var last = null;

    if (target === undefined) {
      target = null;
    }

    for (var idx = 0; idx < len; idx++) {
      var next = this.nextObject(idx, last, context);
      callback.call(target, next, idx, this);
      last = next;
    }

    last = null;
    context = pushCtx(context);

    return this;
  },

  /**
    Alias for `mapBy`

    @method getEach
    @param {String} key name of the property
    @return {Array} The mapped array.
    @public
  */
  getEach: aliasMethod('mapBy'),

  /**
    Sets the value on the named property for each member. This is more
    efficient than using other methods defined on this helper. If the object
    implements Ember.Observable, the value will be changed to `set(),` otherwise
    it will be set directly. `null` objects are skipped.

    @method setEach
    @param {String} key The key to set
    @param {Object} value The object to set
    @return {Object} receiver
    @private
  */
  setEach(key, value) {
    return this.forEach(function(item) {
      set(item, key, value);
    });
  },

  /**
    Maps all of the items in the enumeration to another value, returning
    a new array. This method corresponds to `map()` defined in JavaScript 1.6.

    The callback method you provide should have the following signature (all
    parameters are optional):

    ```javascript
    function(item, index, enumerable);
    ```

    - `item` is the current item in the iteration.
    - `index` is the current index in the iteration.
    - `enumerable` is the enumerable object itself.

    It should return the mapped value.

    Note that in addition to a callback, you can also pass an optional target
    object that will be set as `this` on the context. This is a good way
    to give your iterator function access to the current object.

    @method map
    @param {Function} callback The callback to execute
    @param {Object} [target] The target object to use
    @return {Array} The mapped array.
    @private
  */
  map(callback, target) {
    var ret = Ember.A();

    this.forEach(function(x, idx, i) {
      ret[idx] = callback.call(target, x, idx, i);
    });

    return ret;
  },

  /**
    Similar to map, this specialized function returns the value of the named
    property on all items in the enumeration.

    @method mapBy
    @param {String} key name of the property
    @return {Array} The mapped array.
    @private
  */
  mapBy(key) {
    return this.map(function(next) {
      return get(next, key);
    });
  },

  /**
    Similar to map, this specialized function returns the value of the named
    property on all items in the enumeration.

    @method mapProperty
    @param {String} key name of the property
    @return {Array} The mapped array.
    @deprecated Use `mapBy` instead
    @private
  */

  mapProperty: aliasMethod('mapBy'),

  /**
    Returns an array with all of the items in the enumeration that the passed
    function returns true for. This method corresponds to `filter()` defined in
    JavaScript 1.6.

    The callback method you provide should have the following signature (all
    parameters are optional):

    ```javascript
    function(item, index, enumerable);
    ```

    - `item` is the current item in the iteration.
    - `index` is the current index in the iteration.
    - `enumerable` is the enumerable object itself.

    It should return `true` to include the item in the results, `false`
    otherwise.

    Note that in addition to a callback, you can also pass an optional target
    object that will be set as `this` on the context. This is a good way
    to give your iterator function access to the current object.

    @method filter
    @param {Function} callback The callback to execute
    @param {Object} [target] The target object to use
    @return {Array} A filtered array.
    @private
  */
  filter(callback, target) {
    var ret = Ember.A();

    this.forEach(function(x, idx, i) {
      if (callback.call(target, x, idx, i)) {
        ret.push(x);
      }
    });

    return ret;
  },

  /**
    Returns an array with all of the items in the enumeration where the passed
    function returns false. This method is the inverse of filter().

    The callback method you provide should have the following signature (all
    parameters are optional):

    ```javascript
    function(item, index, enumerable);
    ```

    - *item* is the current item in the iteration.
    - *index* is the current index in the iteration
    - *enumerable* is the enumerable object itself.

    It should return a falsey value to include the item in the results.

    Note that in addition to a callback, you can also pass an optional target
    object that will be set as "this" on the context. This is a good way
    to give your iterator function access to the current object.

    @method reject
    @param {Function} callback The callback to execute
    @param {Object} [target] The target object to use
    @return {Array} A rejected array.
     @private
  */
  reject(callback, target) {
    return this.filter(function() {
      return !(callback.apply(target, arguments));
    });
  },

  /**
    Returns an array with just the items with the matched property. You
    can pass an optional second argument with the target value. Otherwise
    this will match any property that evaluates to `true`.

    @method filterBy
    @param {String} key the property to test
    @param {*} [value] optional value to test against.
    @return {Array} filtered array
    @private
  */
  filterBy(key, value) {
    return this.filter(iter.apply(this, arguments));
  },

  /**
    Returns an array with just the items with the matched property. You
    can pass an optional second argument with the target value. Otherwise
    this will match any property that evaluates to `true`.

    @method filterProperty
    @param {String} key the property to test
    @param {String} [value] optional value to test against.
    @return {Array} filtered array
    @deprecated Use `filterBy` instead
    @private
  */
  filterProperty: aliasMethod('filterBy'),

  /**
    Returns an array with the items that do not have truthy values for
    key.  You can pass an optional second argument with the target value.  Otherwise
    this will match any property that evaluates to false.

    @method rejectBy
    @param {String} key the property to test
    @param {String} [value] optional value to test against.
    @return {Array} rejected array
    @private
  */
  rejectBy(key, value) {
    var exactValue = function(item) {
      return get(item, key) === value;
    };

    var hasValue = function(item) {
      return !!get(item, key);
    };

    var use = (arguments.length === 2 ? exactValue : hasValue);

    return this.reject(use);
  },

  /**
    Returns an array with the items that do not have truthy values for
    key.  You can pass an optional second argument with the target value.  Otherwise
    this will match any property that evaluates to false.

    @method rejectProperty
    @param {String} key the property to test
    @param {String} [value] optional value to test against.
    @return {Array} rejected array
    @deprecated Use `rejectBy` instead
    @private
  */
  rejectProperty: aliasMethod('rejectBy'),

  /**
    Returns the first item in the array for which the callback returns true.
    This method works similar to the `filter()` method defined in JavaScript 1.6
    except that it will stop working on the array once a match is found.

    The callback method you provide should have the following signature (all
    parameters are optional):

    ```javascript
    function(item, index, enumerable);
    ```

    - `item` is the current item in the iteration.
    - `index` is the current index in the iteration.
    - `enumerable` is the enumerable object itself.

    It should return the `true` to include the item in the results, `false`
    otherwise.

    Note that in addition to a callback, you can also pass an optional target
    object that will be set as `this` on the context. This is a good way
    to give your iterator function access to the current object.

    @method find
    @param {Function} callback The callback to execute
    @param {Object} [target] The target object to use
    @return {Object} Found item or `undefined`.
    @public
  */
  find(callback, target) {
    var len = get(this, 'length');

    if (target === undefined) {
      target = null;
    }

    var context = popCtx();
    var found = false;
    var last = null;
    var next, ret;

    for (var idx = 0; idx < len && !found; idx++) {
      next = this.nextObject(idx, last, context);

      if (found = callback.call(target, next, idx, this)) {
        ret = next;
      }

      last = next;
    }

    next = last = null;
    context = pushCtx(context);

    return ret;
  },

  /**
    Returns the first item with a property matching the passed value. You
    can pass an optional second argument with the target value. Otherwise
    this will match any property that evaluates to `true`.

    This method works much like the more generic `find()` method.

    @method findBy
    @param {String} key the property to test
    @param {String} [value] optional value to test against.
    @return {Object} found item or `undefined`
    @public
  */
  findBy(key, value) {
    return this.find(iter.apply(this, arguments));
  },

  /**
    Returns the first item with a property matching the passed value. You
    can pass an optional second argument with the target value. Otherwise
    this will match any property that evaluates to `true`.

    This method works much like the more generic `find()` method.

    @method findProperty
    @param {String} key the property to test
    @param {String} [value] optional value to test against.
    @return {Object} found item or `undefined`
    @deprecated Use `findBy` instead
    @private
  */
  findProperty: aliasMethod('findBy'),

  /**
    Returns `true` if the passed function returns true for every item in the
    enumeration. This corresponds with the `every()` method in JavaScript 1.6.

    The callback method you provide should have the following signature (all
    parameters are optional):

    ```javascript
    function(item, index, enumerable);
    ```

    - `item` is the current item in the iteration.
    - `index` is the current index in the iteration.
    - `enumerable` is the enumerable object itself.

    It should return the `true` or `false`.

    Note that in addition to a callback, you can also pass an optional target
    object that will be set as `this` on the context. This is a good way
    to give your iterator function access to the current object.

    Example Usage:

    ```javascript
    if (people.every(isEngineer)) {
      Paychecks.addBigBonus();
    }
    ```

    @method every
    @param {Function} callback The callback to execute
    @param {Object} [target] The target object to use
    @return {Boolean}
    @private
  */
  every(callback, target) {
    return !this.find(function(x, idx, i) {
      return !callback.call(target, x, idx, i);
    });
  },

  /**
    @method everyBy
    @param {String} key the property to test
    @param {String} [value] optional value to test against.
    @deprecated Use `isEvery` instead
    @return {Boolean}
    @private
  */
  everyBy: aliasMethod('isEvery'),

  /**
    @method everyProperty
    @param {String} key the property to test
    @param {String} [value] optional value to test against.
    @deprecated Use `isEvery` instead
    @return {Boolean}
    @private
  */
  everyProperty: aliasMethod('isEvery'),

  /**
    Returns `true` if the passed property resolves to `true` for all items in
    the enumerable. This method is often simpler/faster than using a callback.

    @method isEvery
    @param {String} key the property to test
    @param {String} [value] optional value to test against.
    @return {Boolean}
    @since 1.3.0
    @public
  */
  isEvery(key, value) {
    return this.every(iter.apply(this, arguments));
  },

  /**
    Returns `true` if the passed function returns true for any item in the
    enumeration. This corresponds with the `some()` method in JavaScript 1.6.

    The callback method you provide should have the following signature (all
    parameters are optional):

    ```javascript
    function(item, index, enumerable);
    ```

    - `item` is the current item in the iteration.
    - `index` is the current index in the iteration.
    - `enumerable` is the enumerable object itself.

    It should return the `true` to include the item in the results, `false`
    otherwise.

    Note that in addition to a callback, you can also pass an optional target
    object that will be set as `this` on the context. This is a good way
    to give your iterator function access to the current object.

    Usage Example:

    ```javascript
    if (people.any(isManager)) {
      Paychecks.addBiggerBonus();
    }
    ```

    @method any
    @param {Function} callback The callback to execute
    @param {Object} [target] The target object to use
    @return {Boolean} `true` if the passed function returns `true` for any item
    @private
  */
  any(callback, target) {
    var len = get(this, 'length');
    var context = popCtx();
    var found = false;
    var last = null;
    var next, idx;

    if (target === undefined) {
      target = null;
    }

    for (idx = 0; idx < len && !found; idx++) {
      next  = this.nextObject(idx, last, context);
      found = callback.call(target, next, idx, this);
      last  = next;
    }

    next = last = null;
    context = pushCtx(context);
    return found;
  },

  /**
    Returns `true` if the passed function returns true for any item in the
    enumeration. This corresponds with the `some()` method in JavaScript 1.6.

    The callback method you provide should have the following signature (all
    parameters are optional):

    ```javascript
    function(item, index, enumerable);
    ```

    - `item` is the current item in the iteration.
    - `index` is the current index in the iteration.
    - `enumerable` is the enumerable object itself.

    It should return the `true` to include the item in the results, `false`
    otherwise.

    Note that in addition to a callback, you can also pass an optional target
    object that will be set as `this` on the context. This is a good way
    to give your iterator function access to the current object.

    Usage Example:

    ```javascript
    if (people.some(isManager)) {
      Paychecks.addBiggerBonus();
    }
    ```

    @method some
    @param {Function} callback The callback to execute
    @param {Object} [target] The target object to use
    @return {Boolean} `true` if the passed function returns `true` for any item
    @deprecated Use `any` instead
    @private
  */
  some: aliasMethod('any'),

  /**
    Returns `true` if the passed property resolves to `true` for any item in
    the enumerable. This method is often simpler/faster than using a callback.

    @method isAny
    @param {String} key the property to test
    @param {String} [value] optional value to test against.
    @return {Boolean}
    @since 1.3.0
    @private
  */
  isAny(key, value) {
    return this.any(iter.apply(this, arguments));
  },

  /**
    @method anyBy
    @param {String} key the property to test
    @param {String} [value] optional value to test against.
    @return {Boolean}
    @deprecated Use `isAny` instead
    @private
  */
  anyBy: aliasMethod('isAny'),

  /**
    @method someProperty
    @param {String} key the property to test
    @param {String} [value] optional value to test against.
    @return {Boolean}
    @deprecated Use `isAny` instead
    @private
  */
  someProperty: aliasMethod('isAny'),

  /**
    This will combine the values of the enumerator into a single value. It
    is a useful way to collect a summary value from an enumeration. This
    corresponds to the `reduce()` method defined in JavaScript 1.8.

    The callback method you provide should have the following signature (all
    parameters are optional):

    ```javascript
    function(previousValue, item, index, enumerable);
    ```

    - `previousValue` is the value returned by the last call to the iterator.
    - `item` is the current item in the iteration.
    - `index` is the current index in the iteration.
    - `enumerable` is the enumerable object itself.

    Return the new cumulative value.

    In addition to the callback you can also pass an `initialValue`. An error
    will be raised if you do not pass an initial value and the enumerator is
    empty.

    Note that unlike the other methods, this method does not allow you to
    pass a target object to set as this for the callback. It's part of the
    spec. Sorry.

    @method reduce
    @param {Function} callback The callback to execute
    @param {Object} initialValue Initial value for the reduce
    @param {String} reducerProperty internal use only.
    @return {Object} The reduced value.
    @private
  */
  reduce(callback, initialValue, reducerProperty) {
    if (typeof callback !== 'function') {
      throw new TypeError();
    }

    var ret = initialValue;

    this.forEach(function(item, i) {
      ret = callback(ret, item, i, this, reducerProperty);
    }, this);

    return ret;
  },

  /**
    Invokes the named method on every object in the receiver that
    implements it. This method corresponds to the implementation in
    Prototype 1.6.

    @method invoke
    @param {String} methodName the name of the method
    @param {Object...} args optional arguments to pass as well.
    @return {Array} return values from calling invoke.
    @private
  */
  invoke(methodName, ...args) {
    var ret = Ember.A();

    this.forEach(function(x, idx) {
      var method = x && x[methodName];

      if ('function' === typeof method) {
        ret[idx] = args ? method.apply(x, args) : x[methodName]();
      }
    }, this);

    return ret;
  },

  /**
    Simply converts the enumerable into a genuine array. The order is not
    guaranteed. Corresponds to the method implemented by Prototype.

    @method toArray
    @return {Array} the enumerable as an array.
    @private
  */
  toArray() {
    var ret = Ember.A();

    this.forEach(function(o, idx) {
      ret[idx] = o;
    });

    return ret;
  },

  /**
    Returns a copy of the array with all `null` and `undefined` elements removed.

    ```javascript
    var arr = ['a', null, 'c', undefined];
    arr.compact();  // ['a', 'c']
    ```

    @method compact
    @return {Array} the array without null and undefined elements.
    @private
  */
  compact() {
    return this.filter(function(value) {
      return value != null;
    });
  },

  /**
    Returns a new enumerable that excludes the passed value. The default
    implementation returns an array regardless of the receiver type unless
    the receiver does not contain the value.

    ```javascript
    var arr = ['a', 'b', 'a', 'c'];
    arr.without('a');  // ['b', 'c']
    ```

    @method without
    @param {Object} value
    @return {Ember.Enumerable}
    @private
  */
  without(value) {
    if (!this.contains(value)) {
      return this; // nothing to do
    }

    var ret = Ember.A();

    this.forEach(function(k) {
      if (k !== value) {
        ret[ret.length] = k;
      }
    });

    return ret;
  },

  /**
    Returns a new enumerable that contains only unique values. The default
    implementation returns an array regardless of the receiver type.

    ```javascript
    var arr = ['a', 'a', 'b', 'b'];
    arr.uniq();  // ['a', 'b']
    ```

    This only works on primitive data types, e.g. Strings, Numbers, etc.

    @method uniq
    @return {Ember.Enumerable}
    @private
  */
  uniq() {
    var ret = Ember.A();

    this.forEach(function(k) {
      if (indexOf(ret, k) < 0) {
        ret.push(k);
      }
    });

    return ret;
  },

  /**
    This property will trigger anytime the enumerable's content changes.
    You can observe this property to be notified of changes to the enumerable's
    content.

    For plain enumerables, this property is read only. `Array` overrides
    this method.

    @property []
    @type Array
    @return this
    @private
  */
  '[]': computed({
    get(key) { return this; }
  }),

  // ..........................................................
  // ENUMERABLE OBSERVERS
  //

  /**
    Registers an enumerable observer. Must implement `Ember.EnumerableObserver`
    mixin.

    @method addEnumerableObserver
    @param {Object} target
    @param {Object} [opts]
    @return this
    @private
  */
  addEnumerableObserver(target, opts) {
    var willChange = (opts && opts.willChange) || 'enumerableWillChange';
    var didChange  = (opts && opts.didChange) || 'enumerableDidChange';
    var hasObservers = get(this, 'hasEnumerableObservers');

    if (!hasObservers) {
      propertyWillChange(this, 'hasEnumerableObservers');
    }

    addListener(this, '@enumerable:before', target, willChange);
    addListener(this, '@enumerable:change', target, didChange);

    if (!hasObservers) {
      propertyDidChange(this, 'hasEnumerableObservers');
    }

    return this;
  },

  /**
    Removes a registered enumerable observer.

    @method removeEnumerableObserver
    @param {Object} target
    @param {Object} [opts]
    @return this
    @private
  */
  removeEnumerableObserver(target, opts) {
    var willChange = (opts && opts.willChange) || 'enumerableWillChange';
    var didChange  = (opts && opts.didChange) || 'enumerableDidChange';
    var hasObservers = get(this, 'hasEnumerableObservers');

    if (hasObservers) {
      propertyWillChange(this, 'hasEnumerableObservers');
    }

    removeListener(this, '@enumerable:before', target, willChange);
    removeListener(this, '@enumerable:change', target, didChange);

    if (hasObservers) {
      propertyDidChange(this, 'hasEnumerableObservers');
    }

    return this;
  },

  /**
    Becomes true whenever the array currently has observers watching changes
    on the array.

    @property hasEnumerableObservers
    @type Boolean
    @private
  */
  hasEnumerableObservers: computed(function() {
    return hasListeners(this, '@enumerable:change') || hasListeners(this, '@enumerable:before');
  }),


  /**
    Invoke this method just before the contents of your enumerable will
    change. You can either omit the parameters completely or pass the objects
    to be removed or added if available or just a count.

    @method enumerableContentWillChange
    @param {Ember.Enumerable|Number} removing An enumerable of the objects to
      be removed or the number of items to be removed.
    @param {Ember.Enumerable|Number} adding An enumerable of the objects to be
      added or the number of items to be added.
    @chainable
    @private
  */
  enumerableContentWillChange(removing, adding) {
    var removeCnt, addCnt, hasDelta;

    if ('number' === typeof removing) {
      removeCnt = removing;
    } else if (removing) {
      removeCnt = get(removing, 'length');
    } else {
      removeCnt = removing = -1;
    }

    if ('number' === typeof adding) {
      addCnt = adding;
    } else if (adding) {
      addCnt = get(adding, 'length');
    } else {
      addCnt = adding = -1;
    }

    hasDelta = addCnt < 0 || removeCnt < 0 || addCnt - removeCnt !== 0;

    if (removing === -1) {
      removing = null;
    }

    if (adding === -1) {
      adding = null;
    }

    propertyWillChange(this, '[]');

    if (hasDelta) {
      propertyWillChange(this, 'length');
    }

    sendEvent(this, '@enumerable:before', [this, removing, adding]);

    return this;
  },

  /**
    Invoke this method when the contents of your enumerable has changed.
    This will notify any observers watching for content changes. If you are
    implementing an ordered enumerable (such as an array), also pass the
    start and end values where the content changed so that it can be used to
    notify range observers.

    @method enumerableContentDidChange
    @param {Ember.Enumerable|Number} removing An enumerable of the objects to
      be removed or the number of items to be removed.
    @param {Ember.Enumerable|Number} adding  An enumerable of the objects to
      be added or the number of items to be added.
    @chainable
    @private
  */
  enumerableContentDidChange(removing, adding) {
    var removeCnt, addCnt, hasDelta;

    if ('number' === typeof removing) {
      removeCnt = removing;
    } else if (removing) {
      removeCnt = get(removing, 'length');
    } else {
      removeCnt = removing = -1;
    }

    if ('number' === typeof adding) {
      addCnt = adding;
    } else if (adding) {
      addCnt = get(adding, 'length');
    } else {
      addCnt = adding = -1;
    }

    hasDelta = addCnt < 0 || removeCnt < 0 || addCnt - removeCnt !== 0;

    if (removing === -1) {
      removing = null;
    }

    if (adding === -1) {
      adding = null;
    }

    sendEvent(this, '@enumerable:change', [this, removing, adding]);

    if (hasDelta) {
      propertyDidChange(this, 'length');
    }

    propertyDidChange(this, '[]');

    return this;
  },

  /**
    Converts the enumerable into an array and sorts by the keys
    specified in the argument.

    You may provide multiple arguments to sort by multiple properties.

    @method sortBy
    @param {String} property name(s) to sort on
    @return {Array} The sorted array.
    @since 1.2.0
    @private
  */
  sortBy() {
    var sortKeys = arguments;

    return this.toArray().sort(function(a, b) {
      for (var i = 0; i < sortKeys.length; i++) {
        var key = sortKeys[i];
        var propA = get(a, key);
        var propB = get(b, key);
        // return 1 or -1 else continue to the next sortKey
        var compareValue = compare(propA, propB);

        if (compareValue) {
          return compareValue;
        }
      }
      return 0;
    });
  }
});
