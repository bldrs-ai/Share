/* eslint-disable */
const __create = Object.create
const __defProp = Object.defineProperty
const __getOwnPropDesc = Object.getOwnPropertyDescriptor
const __getOwnPropNames = Object.getOwnPropertyNames
const __getProtoOf = Object.getPrototypeOf
const __hasOwnProp = Object.prototype.hasOwnProperty
const __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, {enumerable: true, configurable: true, writable: true, value}) : obj[key] = value
const __name = (target, value) => __defProp(target, 'name', {value, configurable: true})
const __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = {exports: {}}).exports, mod), mod.exports
}
const __copyProps = (to, from, except, desc) => {
  if (from && typeof from === 'object' || typeof from === 'function') {
    for (const key of __getOwnPropNames(from)) {
if (!__hasOwnProp.call(to, key) && key !== except) {
__defProp(to, key, {get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable})
}
}
  }
  return to
}
const __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, 'default', {value: mod, enumerable: true}) : target,
  mod,
))
const __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== 'symbol' ? `${key }` : key, value)
  return value
}

// node_modules/events/events.js
const require_events = __commonJS({
  'node_modules/events/events.js'(exports, module) {
    'use strict'
    const R = typeof Reflect === 'object' ? Reflect : null
    const ReflectApply = R && typeof R.apply === 'function' ? R.apply : /* @__PURE__ */ __name(function ReflectApply2(target, receiver, args) {
      return Function.prototype.apply.call(target, receiver, args)
    }, 'ReflectApply')
    let ReflectOwnKeys
    if (R && typeof R.ownKeys === 'function') {
      ReflectOwnKeys = R.ownKeys
    } else if (Object.getOwnPropertySymbols) {
      ReflectOwnKeys = /* @__PURE__ */ __name(function ReflectOwnKeys2(target) {
        return Object.getOwnPropertyNames(target).concat(Object.getOwnPropertySymbols(target))
      }, 'ReflectOwnKeys')
    } else {
      ReflectOwnKeys = /* @__PURE__ */ __name(function ReflectOwnKeys2(target) {
        return Object.getOwnPropertyNames(target)
      }, 'ReflectOwnKeys')
    }
    /**
     *
     */
    function ProcessEmitWarning(warning) {
      if (console && console.warn) {
console.warn(warning)
}
    }
    __name(ProcessEmitWarning, 'ProcessEmitWarning')
    const NumberIsNaN = Number.isNaN || /* @__PURE__ */ __name(function NumberIsNaN2(value) {
      return value !== value
    }, 'NumberIsNaN')
    /**
     *
     */
    function EventEmitter() {
      EventEmitter.init.call(this)
    }
    __name(EventEmitter, 'EventEmitter')
    module.exports = EventEmitter
    module.exports.once = once
    EventEmitter.EventEmitter = EventEmitter
    EventEmitter.prototype._events = void 0
    EventEmitter.prototype._eventsCount = 0
    EventEmitter.prototype._maxListeners = void 0
    let defaultMaxListeners = 10
    /**
     *
     */
    function checkListener(listener) {
      if (typeof listener !== 'function') {
        throw new TypeError(`The "listener" argument must be of type Function. Received type ${ typeof listener}`)
      }
    }
    __name(checkListener, 'checkListener')
    Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
      enumerable: true,
      get: function() {
        return defaultMaxListeners
      },
      set: function(arg) {
        if (typeof arg !== 'number' || arg < 0 || NumberIsNaN(arg)) {
          throw new RangeError(`The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ${ arg }.`)
        }
        defaultMaxListeners = arg
      },
    })
    EventEmitter.init = function() {
      if (this._events === void 0 || this._events === Object.getPrototypeOf(this)._events) {
        this._events = /* @__PURE__ */ Object.create(null)
        this._eventsCount = 0
      }
      this._maxListeners = this._maxListeners || void 0
    }
    EventEmitter.prototype.setMaxListeners = /* @__PURE__ */ __name(function setMaxListeners(n) {
      if (typeof n !== 'number' || n < 0 || NumberIsNaN(n)) {
        throw new RangeError(`The value of "n" is out of range. It must be a non-negative number. Received ${ n }.`)
      }
      this._maxListeners = n
      return this
    }, 'setMaxListeners')
    /**
     *
     */
    function _getMaxListeners(that) {
      if (that._maxListeners === void 0) {
return EventEmitter.defaultMaxListeners
}
      return that._maxListeners
    }
    __name(_getMaxListeners, '_getMaxListeners')
    EventEmitter.prototype.getMaxListeners = /* @__PURE__ */ __name(function getMaxListeners() {
      return _getMaxListeners(this)
    }, 'getMaxListeners')
    EventEmitter.prototype.emit = /* @__PURE__ */ __name(function emit(type) {
      const args = []
      for (var i = 1; i < arguments.length; i++) {
args.push(arguments[i])
}
      let doError = type === 'error'
      const events = this._events
      if (events !== void 0) {
doError = doError && events.error === void 0
} else if (!doError) {
return false
}
      if (doError) {
        let er
        if (args.length > 0) {
er = args[0]
}
        if (er instanceof Error) {
          throw er
        }
        const err = new Error(`Unhandled error.${ er ? ` (${ er.message })` : ''}`)
        err.context = er
        throw err
      }
      const handler = events[type]
      if (handler === void 0) {
return false
}
      if (typeof handler === 'function') {
        ReflectApply(handler, this, args)
      } else {
        const len = handler.length
        const listeners = arrayClone(handler, len)
        for (var i = 0; i < len; ++i) {
ReflectApply(listeners[i], this, args)
}
      }
      return true
    }, 'emit')
    /**
     *
     */
    function _addListener(target, type, listener, prepend) {
      let m
      let events
      let existing
      checkListener(listener)
      events = target._events
      if (events === void 0) {
        events = target._events = /* @__PURE__ */ Object.create(null)
        target._eventsCount = 0
      } else {
        if (events.newListener !== void 0) {
          target.emit(
            'newListener',
            type,
            listener.listener ? listener.listener : listener,
          )
          events = target._events
        }
        existing = events[type]
      }
      if (existing === void 0) {
        existing = events[type] = listener
        ++target._eventsCount
      } else {
        if (typeof existing === 'function') {
          existing = events[type] = prepend ? [listener, existing] : [existing, listener]
        } else if (prepend) {
          existing.unshift(listener)
        } else {
          existing.push(listener)
        }
        m = _getMaxListeners(target)
        if (m > 0 && existing.length > m && !existing.warned) {
          existing.warned = true
          const w = new Error(`Possible EventEmitter memory leak detected. ${ existing.length } ${ String(type) } listeners added. Use emitter.setMaxListeners() to increase limit`)
          w.name = 'MaxListenersExceededWarning'
          w.emitter = target
          w.type = type
          w.count = existing.length
          ProcessEmitWarning(w)
        }
      }
      return target
    }
    __name(_addListener, '_addListener')
    EventEmitter.prototype.addListener = /* @__PURE__ */ __name(function addListener(type, listener) {
      return _addListener(this, type, listener, false)
    }, 'addListener')
    EventEmitter.prototype.on = EventEmitter.prototype.addListener
    EventEmitter.prototype.prependListener = /* @__PURE__ */ __name(function prependListener(type, listener) {
      return _addListener(this, type, listener, true)
    }, 'prependListener')
    /**
     *
     */
    function onceWrapper() {
      if (!this.fired) {
        this.target.removeListener(this.type, this.wrapFn)
        this.fired = true
        if (arguments.length === 0) {
return this.listener.call(this.target)
}
        return this.listener.apply(this.target, arguments)
      }
    }
    __name(onceWrapper, 'onceWrapper')
    /**
     *
     */
    function _onceWrap(target, type, listener) {
      const state = {fired: false, wrapFn: void 0, target, type, listener}
      const wrapped = onceWrapper.bind(state)
      wrapped.listener = listener
      state.wrapFn = wrapped
      return wrapped
    }
    __name(_onceWrap, '_onceWrap')
    EventEmitter.prototype.once = /* @__PURE__ */ __name(function once2(type, listener) {
      checkListener(listener)
      this.on(type, _onceWrap(this, type, listener))
      return this
    }, 'once')
    EventEmitter.prototype.prependOnceListener = /* @__PURE__ */ __name(function prependOnceListener(type, listener) {
      checkListener(listener)
      this.prependListener(type, _onceWrap(this, type, listener))
      return this
    }, 'prependOnceListener')
    EventEmitter.prototype.removeListener = /* @__PURE__ */ __name(function removeListener(type, listener) {
      let list; let events; let position; let i; let originalListener
      checkListener(listener)
      events = this._events
      if (events === void 0) {
return this
}
      list = events[type]
      if (list === void 0) {
return this
}
      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0) {
this._events = /* @__PURE__ */ Object.create(null)
} else {
          delete events[type]
          if (events.removeListener) {
this.emit('removeListener', type, list.listener || listener)
}
        }
      } else if (typeof list !== 'function') {
        position = -1
        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener
            position = i
            break
          }
        }
        if (position < 0) {
return this
}
        if (position === 0) {
list.shift()
} else {
          spliceOne(list, position)
        }
        if (list.length === 1) {
events[type] = list[0]
}
        if (events.removeListener !== void 0) {
this.emit('removeListener', type, originalListener || listener)
}
      }
      return this
    }, 'removeListener')
    EventEmitter.prototype.off = EventEmitter.prototype.removeListener
    EventEmitter.prototype.removeAllListeners = /* @__PURE__ */ __name(function removeAllListeners(type) {
      let listeners; let events; let i
      events = this._events
      if (events === void 0) {
return this
}
      if (events.removeListener === void 0) {
        if (arguments.length === 0) {
          this._events = /* @__PURE__ */ Object.create(null)
          this._eventsCount = 0
        } else if (events[type] !== void 0) {
          if (--this._eventsCount === 0) {
this._events = /* @__PURE__ */ Object.create(null)
} else {
delete events[type]
}
        }
        return this
      }
      if (arguments.length === 0) {
        const keys = Object.keys(events)
        let key
        for (i = 0; i < keys.length; ++i) {
          key = keys[i]
          if (key === 'removeListener') {
continue
}
          this.removeAllListeners(key)
        }
        this.removeAllListeners('removeListener')
        this._events = /* @__PURE__ */ Object.create(null)
        this._eventsCount = 0
        return this
      }
      listeners = events[type]
      if (typeof listeners === 'function') {
        this.removeListener(type, listeners)
      } else if (listeners !== void 0) {
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i])
        }
      }
      return this
    }, 'removeAllListeners')
    /**
     *
     */
    function _listeners(target, type, unwrap) {
      const events = target._events
      if (events === void 0) {
return []
}
      const evlistener = events[type]
      if (evlistener === void 0) {
return []
}
      if (typeof evlistener === 'function') {
return unwrap ? [evlistener.listener || evlistener] : [evlistener]
}
      return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length)
    }
    __name(_listeners, '_listeners')
    EventEmitter.prototype.listeners = /* @__PURE__ */ __name(function listeners(type) {
      return _listeners(this, type, true)
    }, 'listeners')
    EventEmitter.prototype.rawListeners = /* @__PURE__ */ __name(function rawListeners(type) {
      return _listeners(this, type, false)
    }, 'rawListeners')
    EventEmitter.listenerCount = function(emitter, type) {
      if (typeof emitter.listenerCount === 'function') {
        return emitter.listenerCount(type)
      } else {
        return listenerCount.call(emitter, type)
      }
    }
    EventEmitter.prototype.listenerCount = listenerCount
    /**
     *
     */
    function listenerCount(type) {
      const events = this._events
      if (events !== void 0) {
        const evlistener = events[type]
        if (typeof evlistener === 'function') {
          return 1
        } else if (evlistener !== void 0) {
          return evlistener.length
        }
      }
      return 0
    }
    __name(listenerCount, 'listenerCount')
    EventEmitter.prototype.eventNames = /* @__PURE__ */ __name(function eventNames() {
      return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : []
    }, 'eventNames')
    /**
     *
     */
    function arrayClone(arr, n) {
      const copy = new Array(n)
      for (let i = 0; i < n; ++i) {
copy[i] = arr[i]
}
      return copy
    }
    __name(arrayClone, 'arrayClone')
    /**
     *
     */
    function spliceOne(list, index) {
      for (; index + 1 < list.length; index++) {
list[index] = list[index + 1]
}
      list.pop()
    }
    __name(spliceOne, 'spliceOne')
    /**
     *
     */
    function unwrapListeners(arr) {
      const ret = new Array(arr.length)
      for (let i = 0; i < ret.length; ++i) {
        ret[i] = arr[i].listener || arr[i]
      }
      return ret
    }
    __name(unwrapListeners, 'unwrapListeners')
    /**
     *
     */
    function once(emitter, name) {
      return new Promise(function(resolve, reject) {
        /**
         *
         */
        function errorListener(err) {
          emitter.removeListener(name, resolver)
          reject(err)
        }
        __name(errorListener, 'errorListener')
        /**
         *
         */
        function resolver() {
          if (typeof emitter.removeListener === 'function') {
            emitter.removeListener('error', errorListener)
          }
          resolve([].slice.call(arguments))
        }
        __name(resolver, 'resolver')

        eventTargetAgnosticAddListener(emitter, name, resolver, {once: true})
        if (name !== 'error') {
          addErrorHandlerIfEventEmitter(emitter, errorListener, {once: true})
        }
      })
    }
    __name(once, 'once')
    /**
     *
     */
    function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
      if (typeof emitter.on === 'function') {
        eventTargetAgnosticAddListener(emitter, 'error', handler, flags)
      }
    }
    __name(addErrorHandlerIfEventEmitter, 'addErrorHandlerIfEventEmitter')
    /**
     *
     */
    function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
      if (typeof emitter.on === 'function') {
        if (flags.once) {
          emitter.once(name, listener)
        } else {
          emitter.on(name, listener)
        }
      } else if (typeof emitter.addEventListener === 'function') {
        emitter.addEventListener(name, /* @__PURE__ */ __name(function wrapListener(arg) {
          if (flags.once) {
            emitter.removeEventListener(name, wrapListener)
          }
          listener(arg)
        }, 'wrapListener'))
      } else {
        throw new TypeError(`The "emitter" argument must be of type EventEmitter. Received type ${ typeof emitter}`)
      }
    }
    __name(eventTargetAgnosticAddListener, 'eventTargetAgnosticAddListener')
  },
})

// node_modules/matrix-widget-api/lib/interfaces/WidgetApiDirection.js
const require_WidgetApiDirection = __commonJS({
  'node_modules/matrix-widget-api/lib/interfaces/WidgetApiDirection.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.WidgetApiDirection = void 0
    exports.invertedDirection = invertedDirection
    const WidgetApiDirection = /* @__PURE__ */ function(WidgetApiDirection2) {
      WidgetApiDirection2['ToWidget'] = 'toWidget'
      WidgetApiDirection2['FromWidget'] = 'fromWidget'
      return WidgetApiDirection2
    }({})
    exports.WidgetApiDirection = WidgetApiDirection
    /**
     *
     */
    function invertedDirection(dir) {
      if (dir === WidgetApiDirection.ToWidget) {
        return WidgetApiDirection.FromWidget
      } else if (dir === WidgetApiDirection.FromWidget) {
        return WidgetApiDirection.ToWidget
      } else {
        throw new Error('Invalid direction')
      }
    }
    __name(invertedDirection, 'invertedDirection')
  },
})

// node_modules/matrix-widget-api/lib/interfaces/ApiVersion.js
const require_ApiVersion = __commonJS({
  'node_modules/matrix-widget-api/lib/interfaces/ApiVersion.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.UnstableApiVersion = exports.MatrixApiVersion = exports.CurrentApiVersions = void 0
    const MatrixApiVersion = /* @__PURE__ */ function(MatrixApiVersion2) {
      MatrixApiVersion2['Prerelease1'] = '0.0.1'
      MatrixApiVersion2['Prerelease2'] = '0.0.2'
      return MatrixApiVersion2
    }({})
    exports.MatrixApiVersion = MatrixApiVersion
    const UnstableApiVersion = /* @__PURE__ */ function(UnstableApiVersion2) {
      UnstableApiVersion2['MSC2762'] = 'org.matrix.msc2762'
      UnstableApiVersion2['MSC2762_UPDATE_STATE'] = 'org.matrix.msc2762_update_state'
      UnstableApiVersion2['MSC2871'] = 'org.matrix.msc2871'
      UnstableApiVersion2['MSC2873'] = 'org.matrix.msc2873'
      UnstableApiVersion2['MSC2931'] = 'org.matrix.msc2931'
      UnstableApiVersion2['MSC2974'] = 'org.matrix.msc2974'
      UnstableApiVersion2['MSC2876'] = 'org.matrix.msc2876'
      UnstableApiVersion2['MSC3819'] = 'org.matrix.msc3819'
      UnstableApiVersion2['MSC3846'] = 'town.robin.msc3846'
      UnstableApiVersion2['MSC3869'] = 'org.matrix.msc3869'
      UnstableApiVersion2['MSC3973'] = 'org.matrix.msc3973'
      UnstableApiVersion2['MSC4039'] = 'org.matrix.msc4039'
      return UnstableApiVersion2
    }({})
    exports.UnstableApiVersion = UnstableApiVersion
    const CurrentApiVersions = [
      MatrixApiVersion.Prerelease1,
      MatrixApiVersion.Prerelease2,
      // MatrixApiVersion.V010,
      UnstableApiVersion.MSC2762,
      UnstableApiVersion.MSC2762_UPDATE_STATE,
      UnstableApiVersion.MSC2871,
      UnstableApiVersion.MSC2873,
      UnstableApiVersion.MSC2931,
      UnstableApiVersion.MSC2974,
      UnstableApiVersion.MSC2876,
      UnstableApiVersion.MSC3819,
      UnstableApiVersion.MSC3846,
      UnstableApiVersion.MSC3869,
      UnstableApiVersion.MSC3973,
      UnstableApiVersion.MSC4039,
    ]
    exports.CurrentApiVersions = CurrentApiVersions
  },
})

// node_modules/matrix-widget-api/lib/transport/PostmessageTransport.js
const require_PostmessageTransport = __commonJS({
  'node_modules/matrix-widget-api/lib/transport/PostmessageTransport.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.PostmessageTransport = void 0
    const _events = require_events()
    const _ = require_lib()
    const _excluded = ['message']
    /**
     *
     */
    function _typeof(obj) {
      '@babel/helpers - typeof'
      return _typeof = typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol' ? function(obj2) {
        return typeof obj2
      } : function(obj2) {
        return obj2 && typeof Symbol === 'function' && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? 'symbol' : typeof obj2
      }, _typeof(obj)
    }
    __name(_typeof, '_typeof')
    /**
     *
     */
    function _objectWithoutProperties(source, excluded) {
      if (source == null) {
return {}
}
      const target = _objectWithoutPropertiesLoose(source, excluded)
      let key; let i
      if (Object.getOwnPropertySymbols) {
        const sourceSymbolKeys = Object.getOwnPropertySymbols(source)
        for (i = 0; i < sourceSymbolKeys.length; i++) {
          key = sourceSymbolKeys[i]
          if (excluded.indexOf(key) >= 0) {
continue
}
          if (!Object.prototype.propertyIsEnumerable.call(source, key)) {
continue
}
          target[key] = source[key]
        }
      }
      return target
    }
    __name(_objectWithoutProperties, '_objectWithoutProperties')
    /**
     *
     */
    function _objectWithoutPropertiesLoose(source, excluded) {
      if (source == null) {
return {}
}
      const target = {}
      const sourceKeys = Object.keys(source)
      let key; let i
      for (i = 0; i < sourceKeys.length; i++) {
        key = sourceKeys[i]
        if (excluded.indexOf(key) >= 0) {
continue
}
        target[key] = source[key]
      }
      return target
    }
    __name(_objectWithoutPropertiesLoose, '_objectWithoutPropertiesLoose')
    /**
     *
     */
    function ownKeys(object, enumerableOnly) {
      const keys = Object.keys(object)
      if (Object.getOwnPropertySymbols) {
        let symbols = Object.getOwnPropertySymbols(object)
        enumerableOnly && (symbols = symbols.filter(function(sym) {
          return Object.getOwnPropertyDescriptor(object, sym).enumerable
        })), keys.push.apply(keys, symbols)
      }
      return keys
    }
    __name(ownKeys, 'ownKeys')
    /**
     *
     */
    function _objectSpread(target) {
      for (let i = 1; i < arguments.length; i++) {
        var source = arguments[i] != null ? arguments[i] : {}
        i % 2 ? ownKeys(Object(source), true).forEach(function(key) {
          _defineProperty(target, key, source[key])
        }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function(key) {
          Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key))
        })
      }
      return target
    }
    __name(_objectSpread, '_objectSpread')
    /**
     *
     */
    function _classCallCheck(instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError('Cannot call a class as a function')
      }
    }
    __name(_classCallCheck, '_classCallCheck')
    /**
     *
     */
    function _defineProperties(target, props) {
      for (let i = 0; i < props.length; i++) {
        const descriptor = props[i]
        descriptor.enumerable = descriptor.enumerable || false
        descriptor.configurable = true
        if ('value' in descriptor) {
descriptor.writable = true
}
        Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor)
      }
    }
    __name(_defineProperties, '_defineProperties')
    /**
     *
     */
    function _createClass(Constructor, protoProps, staticProps) {
      if (protoProps) {
_defineProperties(Constructor.prototype, protoProps)
}
      if (staticProps) {
_defineProperties(Constructor, staticProps)
}
      Object.defineProperty(Constructor, 'prototype', {writable: false})
      return Constructor
    }
    __name(_createClass, '_createClass')
    /**
     *
     */
    function _inherits(subClass, superClass) {
      if (typeof superClass !== 'function' && superClass !== null) {
        throw new TypeError('Super expression must either be null or a function')
      }
      subClass.prototype = Object.create(superClass && superClass.prototype, {constructor: {value: subClass, writable: true, configurable: true}})
      Object.defineProperty(subClass, 'prototype', {writable: false})
      if (superClass) {
_setPrototypeOf(subClass, superClass)
}
    }
    __name(_inherits, '_inherits')
    /**
     *
     */
    function _setPrototypeOf(o, p) {
      _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : /* @__PURE__ */ __name(function _setPrototypeOf2(o2, p2) {
        o2.__proto__ = p2
        return o2
      }, '_setPrototypeOf')
      return _setPrototypeOf(o, p)
    }
    __name(_setPrototypeOf, '_setPrototypeOf')
    /**
     *
     */
    function _createSuper(Derived) {
      const hasNativeReflectConstruct = _isNativeReflectConstruct()
      return /* @__PURE__ */ __name(function _createSuperInternal() {
        const Super = _getPrototypeOf(Derived); let result
        if (hasNativeReflectConstruct) {
          const NewTarget = _getPrototypeOf(this).constructor
          result = Reflect.construct(Super, arguments, NewTarget)
        } else {
          result = Super.apply(this, arguments)
        }
        return _possibleConstructorReturn(this, result)
      }, '_createSuperInternal')
    }
    __name(_createSuper, '_createSuper')
    /**
     *
     */
    function _possibleConstructorReturn(self, call) {
      if (call && (_typeof(call) === 'object' || typeof call === 'function')) {
        return call
      } else if (call !== void 0) {
        throw new TypeError('Derived constructors may only return object or undefined')
      }
      return _assertThisInitialized(self)
    }
    __name(_possibleConstructorReturn, '_possibleConstructorReturn')
    /**
     *
     */
    function _assertThisInitialized(self) {
      if (self === void 0) {
        throw new ReferenceError('this hasn\'t been initialised - super() hasn\'t been called')
      }
      return self
    }
    __name(_assertThisInitialized, '_assertThisInitialized')
    /**
     *
     */
    function _isNativeReflectConstruct() {
      if (typeof Reflect === 'undefined' || !Reflect.construct) {
return false
}
      if (Reflect.construct.sham) {
return false
}
      if (typeof Proxy === 'function') {
return true
}
      try {
        Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
        }))
        return true
      } catch (e) {
        return false
      }
    }
    __name(_isNativeReflectConstruct, '_isNativeReflectConstruct')
    /**
     *
     */
    function _getPrototypeOf(o) {
      _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : /* @__PURE__ */ __name(function _getPrototypeOf2(o2) {
        return o2.__proto__ || Object.getPrototypeOf(o2)
      }, '_getPrototypeOf')
      return _getPrototypeOf(o)
    }
    __name(_getPrototypeOf, '_getPrototypeOf')
    /**
     *
     */
    function _defineProperty(obj, key, value) {
      key = _toPropertyKey(key)
      if (key in obj) {
        Object.defineProperty(obj, key, {value, enumerable: true, configurable: true, writable: true})
      } else {
        obj[key] = value
      }
      return obj
    }
    __name(_defineProperty, '_defineProperty')
    /**
     *
     */
    function _toPropertyKey(arg) {
      const key = _toPrimitive(arg, 'string')
      return _typeof(key) === 'symbol' ? key : String(key)
    }
    __name(_toPropertyKey, '_toPropertyKey')
    /**
     *
     */
    function _toPrimitive(input, hint) {
      if (_typeof(input) !== 'object' || input === null) {
return input
}
      const prim = input[Symbol.toPrimitive]
      if (prim !== void 0) {
        const res = prim.call(input, hint || 'default')
        if (_typeof(res) !== 'object') {
return res
}
        throw new TypeError('@@toPrimitive must return a primitive value.')
      }
      return (hint === 'string' ? String : Number)(input)
    }
    __name(_toPrimitive, '_toPrimitive')
    const PostmessageTransport = /* @__PURE__ */ function(_EventEmitter) {
      _inherits(PostmessageTransport2, _EventEmitter)
      const _super = _createSuper(PostmessageTransport2)
      /**
       *
       */
      function PostmessageTransport2(sendDirection, initialWidgetId, transportWindow, inboundWindow) {
        let _this
        _classCallCheck(this, PostmessageTransport2)
        _this = _super.call(this)
        _this.sendDirection = sendDirection
        _this.initialWidgetId = initialWidgetId
        _this.transportWindow = transportWindow
        _this.inboundWindow = inboundWindow
        _defineProperty(_assertThisInitialized(_this), 'strictOriginCheck', false)
        _defineProperty(_assertThisInitialized(_this), 'targetOrigin', '*')
        _defineProperty(_assertThisInitialized(_this), 'timeoutSeconds', 10)
        _defineProperty(_assertThisInitialized(_this), '_ready', false)
        _defineProperty(_assertThisInitialized(_this), '_widgetId', null)
        _defineProperty(_assertThisInitialized(_this), 'outboundRequests', /* @__PURE__ */ new Map())
        _defineProperty(_assertThisInitialized(_this), 'stopController', new AbortController())
        _this._widgetId = initialWidgetId
        return _this
      }
      __name(PostmessageTransport2, 'PostmessageTransport')
      _createClass(PostmessageTransport2, [{
        key: 'ready',
        get: /* @__PURE__ */ __name(function get() {
          return this._ready
        }, 'get'),
      }, {
        key: 'widgetId',
        get: /* @__PURE__ */ __name(function get() {
          return this._widgetId || null
        }, 'get'),
      }, {
        key: 'nextRequestId',
        get: /* @__PURE__ */ __name(function get() {
          const idBase = 'widgetapi-'.concat(Date.now())
          let index = 0
          let id = idBase
          while (this.outboundRequests.has(id)) {
            id = ''.concat(idBase, '-').concat(index++)
          }
          this.outboundRequests.set(id, null)
          return id
        }, 'get'),
      }, {
        key: 'sendInternal',
        value: /* @__PURE__ */ __name(function sendInternal(message) {
          console.log('[PostmessageTransport] Sending object to '.concat(this.targetOrigin, ': '), message)
          this.transportWindow.postMessage(message, this.targetOrigin)
        }, 'sendInternal'),
      }, {
        key: 'reply',
        value: /* @__PURE__ */ __name(function reply(request, responseData) {
          return this.sendInternal(_objectSpread(_objectSpread({}, request), {}, {
            response: responseData,
          }))
        }, 'reply'),
      }, {
        key: 'send',
        value: /* @__PURE__ */ __name(function send(action, data) {
          return this.sendComplete(action, data).then(function(r) {
            return r.response
          })
        }, 'send'),
      }, {
        key: 'sendComplete',
        value: /* @__PURE__ */ __name(function sendComplete(action, data) {
          const _this2 = this
          if (!this.ready || !this.widgetId) {
            return Promise.reject(new Error('Not ready or unknown widget ID'))
          }
          const request = {
            api: this.sendDirection,
            widgetId: this.widgetId,
            requestId: this.nextRequestId,
            action,
            data,
          }
          if (action === _.WidgetApiToWidgetAction.UpdateVisibility) {
            request['visible'] = data['visible']
          }
          return new Promise(function(prResolve, prReject) {
            const resolve = /* @__PURE__ */ __name(function resolve2(response) {
              cleanUp()
              prResolve(response)
            }, 'resolve')
            const reject = /* @__PURE__ */ __name(function reject2(err) {
              cleanUp()
              prReject(err)
            }, 'reject')
            const timerId = setTimeout(function() {
              return reject(new Error('Request timed out'))
            }, (_this2.timeoutSeconds || 1) * 1e3)
            const onStop = /* @__PURE__ */ __name(function onStop2() {
              return reject(new Error('Transport stopped'))
            }, 'onStop')
            _this2.stopController.signal.addEventListener('abort', onStop)
            var cleanUp = /* @__PURE__ */ __name(function cleanUp2() {
              _this2.outboundRequests['delete'](request.requestId)
              clearTimeout(timerId)
              _this2.stopController.signal.removeEventListener('abort', onStop)
            }, 'cleanUp')
            _this2.outboundRequests.set(request.requestId, {
              request,
              resolve,
              reject,
            })
            _this2.sendInternal(request)
          })
        }, 'sendComplete'),
      }, {
        key: 'start',
        value: /* @__PURE__ */ __name(function start() {
          const _this3 = this
          this.inboundWindow.addEventListener('message', function(ev) {
            _this3.handleMessage(ev)
          })
          this._ready = true
        }, 'start'),
      }, {
        key: 'stop',
        value: /* @__PURE__ */ __name(function stop() {
          this._ready = false
          this.stopController.abort()
        }, 'stop'),
      }, {
        key: 'handleMessage',
        value: /* @__PURE__ */ __name(function handleMessage(ev) {
          if (this.stopController.signal.aborted) {
return
}
          if (!ev.data) {
return
}
          if (this.strictOriginCheck && ev.origin !== window.origin) {
return
}
          const response = ev.data
          if (!response.action || !response.requestId || !response.widgetId) {
return
}
          if (!response.response) {
            const request = response
            if (request.api !== (0, _.invertedDirection)(this.sendDirection)) {
return
}
            this.handleRequest(request)
          } else {
            if (response.api !== this.sendDirection) {
return
}
            this.handleResponse(response)
          }
        }, 'handleMessage'),
      }, {
        key: 'handleRequest',
        value: /* @__PURE__ */ __name(function handleRequest(request) {
          if (this.widgetId) {
            if (this.widgetId !== request.widgetId) {
return
}
          } else {
            this._widgetId = request.widgetId
          }
          this.emit('message', new CustomEvent('message', {
            detail: request,
          }))
        }, 'handleRequest'),
      }, {
        key: 'handleResponse',
        value: /* @__PURE__ */ __name(function handleResponse(response) {
          if (response.widgetId !== this.widgetId) {
return
}
          const req = this.outboundRequests.get(response.requestId)
          if (!req) {
return
}
          if ((0, _.isErrorResponse)(response.response)) {
            const _response$response$er = response.response.error; const message = _response$response$er.message; const data = _objectWithoutProperties(_response$response$er, _excluded)
            req.reject(new _.WidgetApiResponseError(message, data))
          } else {
            req.resolve(response)
          }
        }, 'handleResponse'),
      }])
      return PostmessageTransport2
    }(_events.EventEmitter)
    exports.PostmessageTransport = PostmessageTransport
  },
})

// node_modules/matrix-widget-api/lib/interfaces/WidgetApiAction.js
const require_WidgetApiAction = __commonJS({
  'node_modules/matrix-widget-api/lib/interfaces/WidgetApiAction.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.WidgetApiToWidgetAction = exports.WidgetApiFromWidgetAction = void 0
    const WidgetApiToWidgetAction = /* @__PURE__ */ function(WidgetApiToWidgetAction2) {
      WidgetApiToWidgetAction2['SupportedApiVersions'] = 'supported_api_versions'
      WidgetApiToWidgetAction2['Capabilities'] = 'capabilities'
      WidgetApiToWidgetAction2['NotifyCapabilities'] = 'notify_capabilities'
      WidgetApiToWidgetAction2['ThemeChange'] = 'theme_change'
      WidgetApiToWidgetAction2['LanguageChange'] = 'language_change'
      WidgetApiToWidgetAction2['TakeScreenshot'] = 'screenshot'
      WidgetApiToWidgetAction2['UpdateVisibility'] = 'visibility'
      WidgetApiToWidgetAction2['OpenIDCredentials'] = 'openid_credentials'
      WidgetApiToWidgetAction2['WidgetConfig'] = 'widget_config'
      WidgetApiToWidgetAction2['CloseModalWidget'] = 'close_modal'
      WidgetApiToWidgetAction2['ButtonClicked'] = 'button_clicked'
      WidgetApiToWidgetAction2['SendEvent'] = 'send_event'
      WidgetApiToWidgetAction2['SendToDevice'] = 'send_to_device'
      WidgetApiToWidgetAction2['UpdateState'] = 'update_state'
      WidgetApiToWidgetAction2['UpdateTurnServers'] = 'update_turn_servers'
      return WidgetApiToWidgetAction2
    }({})
    exports.WidgetApiToWidgetAction = WidgetApiToWidgetAction
    const WidgetApiFromWidgetAction = /* @__PURE__ */ function(WidgetApiFromWidgetAction2) {
      WidgetApiFromWidgetAction2['SupportedApiVersions'] = 'supported_api_versions'
      WidgetApiFromWidgetAction2['ContentLoaded'] = 'content_loaded'
      WidgetApiFromWidgetAction2['SendSticker'] = 'm.sticker'
      WidgetApiFromWidgetAction2['UpdateAlwaysOnScreen'] = 'set_always_on_screen'
      WidgetApiFromWidgetAction2['GetOpenIDCredentials'] = 'get_openid'
      WidgetApiFromWidgetAction2['CloseModalWidget'] = 'close_modal'
      WidgetApiFromWidgetAction2['OpenModalWidget'] = 'open_modal'
      WidgetApiFromWidgetAction2['SetModalButtonEnabled'] = 'set_button_enabled'
      WidgetApiFromWidgetAction2['SendEvent'] = 'send_event'
      WidgetApiFromWidgetAction2['SendToDevice'] = 'send_to_device'
      WidgetApiFromWidgetAction2['WatchTurnServers'] = 'watch_turn_servers'
      WidgetApiFromWidgetAction2['UnwatchTurnServers'] = 'unwatch_turn_servers'
      WidgetApiFromWidgetAction2['BeeperReadRoomAccountData'] = 'com.beeper.read_room_account_data'
      WidgetApiFromWidgetAction2['MSC2876ReadEvents'] = 'org.matrix.msc2876.read_events'
      WidgetApiFromWidgetAction2['MSC2931Navigate'] = 'org.matrix.msc2931.navigate'
      WidgetApiFromWidgetAction2['MSC2974RenegotiateCapabilities'] = 'org.matrix.msc2974.request_capabilities'
      WidgetApiFromWidgetAction2['MSC3869ReadRelations'] = 'org.matrix.msc3869.read_relations'
      WidgetApiFromWidgetAction2['MSC3973UserDirectorySearch'] = 'org.matrix.msc3973.user_directory_search'
      WidgetApiFromWidgetAction2['MSC4039GetMediaConfigAction'] = 'org.matrix.msc4039.get_media_config'
      WidgetApiFromWidgetAction2['MSC4039UploadFileAction'] = 'org.matrix.msc4039.upload_file'
      WidgetApiFromWidgetAction2['MSC4039DownloadFileAction'] = 'org.matrix.msc4039.download_file'
      WidgetApiFromWidgetAction2['MSC4157UpdateDelayedEvent'] = 'org.matrix.msc4157.update_delayed_event'
      return WidgetApiFromWidgetAction2
    }({})
    exports.WidgetApiFromWidgetAction = WidgetApiFromWidgetAction
  },
})

// node_modules/matrix-widget-api/lib/interfaces/GetOpenIDAction.js
const require_GetOpenIDAction = __commonJS({
  'node_modules/matrix-widget-api/lib/interfaces/GetOpenIDAction.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.OpenIDRequestState = void 0
    const OpenIDRequestState = /* @__PURE__ */ function(OpenIDRequestState2) {
      OpenIDRequestState2['Allowed'] = 'allowed'
      OpenIDRequestState2['Blocked'] = 'blocked'
      OpenIDRequestState2['PendingUserConfirmation'] = 'request'
      return OpenIDRequestState2
    }({})
    exports.OpenIDRequestState = OpenIDRequestState
  },
})

// node_modules/matrix-widget-api/lib/interfaces/WidgetType.js
const require_WidgetType = __commonJS({
  'node_modules/matrix-widget-api/lib/interfaces/WidgetType.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.MatrixWidgetType = void 0
    const MatrixWidgetType = /* @__PURE__ */ function(MatrixWidgetType2) {
      MatrixWidgetType2['Custom'] = 'm.custom'
      MatrixWidgetType2['JitsiMeet'] = 'm.jitsi'
      MatrixWidgetType2['Stickerpicker'] = 'm.stickerpicker'
      return MatrixWidgetType2
    }({})
    exports.MatrixWidgetType = MatrixWidgetType
  },
})

// node_modules/matrix-widget-api/lib/interfaces/ModalWidgetActions.js
const require_ModalWidgetActions = __commonJS({
  'node_modules/matrix-widget-api/lib/interfaces/ModalWidgetActions.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.BuiltInModalButtonID = void 0
    const BuiltInModalButtonID = /* @__PURE__ */ function(BuiltInModalButtonID2) {
      BuiltInModalButtonID2['Close'] = 'm.close'
      return BuiltInModalButtonID2
    }({})
    exports.BuiltInModalButtonID = BuiltInModalButtonID
  },
})

// node_modules/matrix-widget-api/lib/models/WidgetEventCapability.js
const require_WidgetEventCapability = __commonJS({
  'node_modules/matrix-widget-api/lib/models/WidgetEventCapability.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.WidgetEventCapability = exports.EventKind = exports.EventDirection = void 0
    /**
     *
     */
    function _typeof(obj) {
      '@babel/helpers - typeof'
      return _typeof = typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol' ? function(obj2) {
        return typeof obj2
      } : function(obj2) {
        return obj2 && typeof Symbol === 'function' && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? 'symbol' : typeof obj2
      }, _typeof(obj)
    }
    __name(_typeof, '_typeof')
    /**
     *
     */
    function _createForOfIteratorHelper(o, allowArrayLike) {
      let it = typeof Symbol !== 'undefined' && o[Symbol.iterator] || o['@@iterator']
      if (!it) {
        if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === 'number') {
          if (it) {
o = it
}
          let i = 0
          const F = /* @__PURE__ */ __name(function F2() {
          }, 'F')
          return {s: F, n: /* @__PURE__ */ __name(function n() {
            if (i >= o.length) {
return {done: true}
}
            return {done: false, value: o[i++]}
          }, 'n'), e: /* @__PURE__ */ __name(function e(_e) {
            throw _e
          }, 'e'), f: F}
        }
        throw new TypeError('Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.')
      }
      let normalCompletion = true; let didErr = false; let err
      return {s: /* @__PURE__ */ __name(function s() {
        it = it.call(o)
      }, 's'), n: /* @__PURE__ */ __name(function n() {
        const step = it.next()
        normalCompletion = step.done
        return step
      }, 'n'), e: /* @__PURE__ */ __name(function e(_e2) {
        didErr = true
        err = _e2
      }, 'e'), f: /* @__PURE__ */ __name(function f() {
        try {
          if (!normalCompletion && it['return'] != null) {
it['return']()
}
        } finally {
          if (didErr) {
throw err
}
        }
      }, 'f')}
    }
    __name(_createForOfIteratorHelper, '_createForOfIteratorHelper')
    /**
     *
     */
    function _unsupportedIterableToArray(o, minLen) {
      if (!o) {
return
}
      if (typeof o === 'string') {
return _arrayLikeToArray(o, minLen)
}
      let n = Object.prototype.toString.call(o).slice(8, -1)
      if (n === 'Object' && o.constructor) {
n = o.constructor.name
}
      if (n === 'Map' || n === 'Set') {
return Array.from(o)
}
      if (n === 'Arguments' || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) {
return _arrayLikeToArray(o, minLen)
}
    }
    __name(_unsupportedIterableToArray, '_unsupportedIterableToArray')
    /**
     *
     */
    function _arrayLikeToArray(arr, len) {
      if (len == null || len > arr.length) {
len = arr.length
}
      for (var i = 0, arr2 = new Array(len); i < len; i++) {
arr2[i] = arr[i]
}
      return arr2
    }
    __name(_arrayLikeToArray, '_arrayLikeToArray')
    /**
     *
     */
    function _classCallCheck(instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError('Cannot call a class as a function')
      }
    }
    __name(_classCallCheck, '_classCallCheck')
    /**
     *
     */
    function _defineProperties(target, props) {
      for (let i = 0; i < props.length; i++) {
        const descriptor = props[i]
        descriptor.enumerable = descriptor.enumerable || false
        descriptor.configurable = true
        if ('value' in descriptor) {
descriptor.writable = true
}
        Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor)
      }
    }
    __name(_defineProperties, '_defineProperties')
    /**
     *
     */
    function _createClass(Constructor, protoProps, staticProps) {
      if (protoProps) {
_defineProperties(Constructor.prototype, protoProps)
}
      if (staticProps) {
_defineProperties(Constructor, staticProps)
}
      Object.defineProperty(Constructor, 'prototype', {writable: false})
      return Constructor
    }
    __name(_createClass, '_createClass')
    /**
     *
     */
    function _toPropertyKey(arg) {
      const key = _toPrimitive(arg, 'string')
      return _typeof(key) === 'symbol' ? key : String(key)
    }
    __name(_toPropertyKey, '_toPropertyKey')
    /**
     *
     */
    function _toPrimitive(input, hint) {
      if (_typeof(input) !== 'object' || input === null) {
return input
}
      const prim = input[Symbol.toPrimitive]
      if (prim !== void 0) {
        const res = prim.call(input, hint || 'default')
        if (_typeof(res) !== 'object') {
return res
}
        throw new TypeError('@@toPrimitive must return a primitive value.')
      }
      return (hint === 'string' ? String : Number)(input)
    }
    __name(_toPrimitive, '_toPrimitive')
    const EventKind = /* @__PURE__ */ function(EventKind2) {
      EventKind2['Event'] = 'event'
      EventKind2['State'] = 'state_event'
      EventKind2['ToDevice'] = 'to_device'
      EventKind2['RoomAccount'] = 'room_account'
      return EventKind2
    }({})
    exports.EventKind = EventKind
    const EventDirection = /* @__PURE__ */ function(EventDirection2) {
      EventDirection2['Send'] = 'send'
      EventDirection2['Receive'] = 'receive'
      return EventDirection2
    }({})
    exports.EventDirection = EventDirection
    const WidgetEventCapability = /* @__PURE__ */ function() {
      /**
       *
       */
      function WidgetEventCapability2(direction, eventType, kind, keyStr, raw) {
        _classCallCheck(this, WidgetEventCapability2)
        this.direction = direction
        this.eventType = eventType
        this.kind = kind
        this.keyStr = keyStr
        this.raw = raw
      }
      __name(WidgetEventCapability2, 'WidgetEventCapability')
      _createClass(WidgetEventCapability2, [{
        key: 'matchesAsStateEvent',
        value: /* @__PURE__ */ __name(function matchesAsStateEvent(direction, eventType, stateKey) {
          if (this.kind !== EventKind.State) {
return false
}
          if (this.direction !== direction) {
return false
}
          if (this.eventType !== eventType) {
return false
}
          if (this.keyStr === null) {
return true
}
          if (this.keyStr === stateKey) {
return true
}
          return false
        }, 'matchesAsStateEvent'),
      }, {
        key: 'matchesAsToDeviceEvent',
        value: /* @__PURE__ */ __name(function matchesAsToDeviceEvent(direction, eventType) {
          if (this.kind !== EventKind.ToDevice) {
return false
}
          if (this.direction !== direction) {
return false
}
          if (this.eventType !== eventType) {
return false
}
          return true
        }, 'matchesAsToDeviceEvent'),
      }, {
        key: 'matchesAsRoomEvent',
        value: /* @__PURE__ */ __name(function matchesAsRoomEvent(direction, eventType) {
          const msgtype = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : null
          if (this.kind !== EventKind.Event) {
return false
}
          if (this.direction !== direction) {
return false
}
          if (this.eventType !== eventType) {
return false
}
          if (this.eventType === 'm.room.message') {
            if (this.keyStr === null) {
return true
}
            if (this.keyStr === msgtype) {
return true
}
          } else {
            return true
          }
          return false
        }, 'matchesAsRoomEvent'),
      }, {
        key: 'matchesAsRoomAccountData',
        value: /* @__PURE__ */ __name(function matchesAsRoomAccountData(direction, eventType) {
          if (this.kind !== EventKind.RoomAccount) {
return false
}
          if (this.direction !== direction) {
return false
}
          if (this.eventType !== eventType) {
return false
}
          return true
        }, 'matchesAsRoomAccountData'),
      }], [{
        key: 'forStateEvent',
        value: /* @__PURE__ */ __name(function forStateEvent(direction, eventType, stateKey) {
          eventType = eventType.replace(/#/g, '\\#')
          stateKey = stateKey !== null && stateKey !== void 0 ? '#'.concat(stateKey) : ''
          const str = 'org.matrix.msc2762.'.concat(direction, '.state_event:').concat(eventType).concat(stateKey)
          return WidgetEventCapability2.findEventCapabilities([str])[0]
        }, 'forStateEvent'),
      }, {
        key: 'forToDeviceEvent',
        value: /* @__PURE__ */ __name(function forToDeviceEvent(direction, eventType) {
          const str = 'org.matrix.msc3819.'.concat(direction, '.to_device:').concat(eventType)
          return WidgetEventCapability2.findEventCapabilities([str])[0]
        }, 'forToDeviceEvent'),
      }, {
        key: 'forRoomEvent',
        value: /* @__PURE__ */ __name(function forRoomEvent(direction, eventType) {
          const str = 'org.matrix.msc2762.'.concat(direction, '.event:').concat(eventType)
          return WidgetEventCapability2.findEventCapabilities([str])[0]
        }, 'forRoomEvent'),
      }, {
        key: 'forRoomMessageEvent',
        value: /* @__PURE__ */ __name(function forRoomMessageEvent(direction, msgtype) {
          msgtype = msgtype === null || msgtype === void 0 ? '' : msgtype
          const str = 'org.matrix.msc2762.'.concat(direction, '.event:m.room.message#').concat(msgtype)
          return WidgetEventCapability2.findEventCapabilities([str])[0]
        }, 'forRoomMessageEvent'),
      }, {
        key: 'forRoomAccountData',
        value: /* @__PURE__ */ __name(function forRoomAccountData(direction, eventType) {
          const str = 'com.beeper.capabilities.'.concat(direction, '.room_account_data:').concat(eventType)
          return WidgetEventCapability2.findEventCapabilities([str])[0]
        }, 'forRoomAccountData'),
        /**
         * Parses a capabilities request to find all the event capability requests.
         *
         * @param {Iterable<Capability>} capabilities The capabilities requested/to parse.
         * @return {WidgetEventCapability[]} An array of event capability requests. May be empty, but never null.
         */
      }, {
        key: 'findEventCapabilities',
        value: /* @__PURE__ */ __name(function findEventCapabilities(capabilities) {
          const parsed = []
          const _iterator = _createForOfIteratorHelper(capabilities); let _step
          try {
            for (_iterator.s(); !(_step = _iterator.n()).done; ) {
              const cap = _step.value
              let _direction = null
              let eventSegment = void 0
              let _kind = null
              if (cap.startsWith('org.matrix.msc2762.send.event:')) {
                _direction = EventDirection.Send
                _kind = EventKind.Event
                eventSegment = cap.substring('org.matrix.msc2762.send.event:'.length)
              } else if (cap.startsWith('org.matrix.msc2762.send.state_event:')) {
                _direction = EventDirection.Send
                _kind = EventKind.State
                eventSegment = cap.substring('org.matrix.msc2762.send.state_event:'.length)
              } else if (cap.startsWith('org.matrix.msc3819.send.to_device:')) {
                _direction = EventDirection.Send
                _kind = EventKind.ToDevice
                eventSegment = cap.substring('org.matrix.msc3819.send.to_device:'.length)
              } else if (cap.startsWith('org.matrix.msc2762.receive.event:')) {
                _direction = EventDirection.Receive
                _kind = EventKind.Event
                eventSegment = cap.substring('org.matrix.msc2762.receive.event:'.length)
              } else if (cap.startsWith('org.matrix.msc2762.receive.state_event:')) {
                _direction = EventDirection.Receive
                _kind = EventKind.State
                eventSegment = cap.substring('org.matrix.msc2762.receive.state_event:'.length)
              } else if (cap.startsWith('org.matrix.msc3819.receive.to_device:')) {
                _direction = EventDirection.Receive
                _kind = EventKind.ToDevice
                eventSegment = cap.substring('org.matrix.msc3819.receive.to_device:'.length)
              } else if (cap.startsWith('com.beeper.capabilities.receive.room_account_data:')) {
                _direction = EventDirection.Receive
                _kind = EventKind.RoomAccount
                eventSegment = cap.substring('com.beeper.capabilities.receive.room_account_data:'.length)
              }
              if (_direction === null || _kind === null || eventSegment === void 0) {
continue
}
              const expectingKeyStr = eventSegment.startsWith('m.room.message#') || _kind === EventKind.State
              let _keyStr = null
              if (eventSegment.includes('#') && expectingKeyStr) {
                const parts = eventSegment.split('#')
                const idx = parts.findIndex(function(p) {
                  return !p.endsWith('\\')
                })
                eventSegment = parts.slice(0, idx + 1).map(function(p) {
                  return p.endsWith('\\') ? p.substring(0, p.length - 1) : p
                }).join('#')
                _keyStr = parts.slice(idx + 1).join('#')
              }
              parsed.push(new WidgetEventCapability2(_direction, eventSegment, _kind, _keyStr, cap))
            }
          } catch (err) {
            _iterator.e(err)
          } finally {
            _iterator.f()
          }
          return parsed
        }, 'findEventCapabilities'),
      }])
      return WidgetEventCapability2
    }()
    exports.WidgetEventCapability = WidgetEventCapability
  },
})

// node_modules/matrix-widget-api/lib/Symbols.js
const require_Symbols = __commonJS({
  'node_modules/matrix-widget-api/lib/Symbols.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.Symbols = void 0
    const Symbols = /* @__PURE__ */ function(Symbols2) {
      Symbols2['AnyRoom'] = '*'
      return Symbols2
    }({})
    exports.Symbols = Symbols
  },
})

// node_modules/matrix-widget-api/lib/WidgetApi.js
const require_WidgetApi = __commonJS({
  'node_modules/matrix-widget-api/lib/WidgetApi.js'(exports) {
    'use strict'
    /**
     *
     */
    function _typeof(obj) {
      '@babel/helpers - typeof'
      return _typeof = typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol' ? function(obj2) {
        return typeof obj2
      } : function(obj2) {
        return obj2 && typeof Symbol === 'function' && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? 'symbol' : typeof obj2
      }, _typeof(obj)
    }
    __name(_typeof, '_typeof')
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.WidgetApiResponseError = exports.WidgetApi = void 0
    const _events = require_events()
    const _WidgetApiDirection = require_WidgetApiDirection()
    const _ApiVersion = require_ApiVersion()
    const _PostmessageTransport = require_PostmessageTransport()
    const _WidgetApiAction = require_WidgetApiAction()
    const _GetOpenIDAction = require_GetOpenIDAction()
    const _WidgetType = require_WidgetType()
    const _ModalWidgetActions = require_ModalWidgetActions()
    const _WidgetEventCapability = require_WidgetEventCapability()
    const _Symbols = require_Symbols()
    /**
     *
     */
    function _regeneratorRuntime() {
      'use strict'
      _regeneratorRuntime = /* @__PURE__ */ __name(function _regeneratorRuntime2() {
        return exports2
      }, '_regeneratorRuntime')
      var exports2 = {}; const Op = Object.prototype; const hasOwn = Op.hasOwnProperty; const defineProperty = Object.defineProperty || function(obj, key, desc) {
        obj[key] = desc.value
      }; const $Symbol = typeof Symbol === 'function' ? Symbol : {}; const iteratorSymbol = $Symbol.iterator || '@@iterator'; const asyncIteratorSymbol = $Symbol.asyncIterator || '@@asyncIterator'; const toStringTagSymbol = $Symbol.toStringTag || '@@toStringTag'
      /**
       *
       */
      function define(obj, key, value) {
        return Object.defineProperty(obj, key, {value, enumerable: true, configurable: true, writable: true}), obj[key]
      }
      __name(define, 'define')
      try {
        define({}, '')
      } catch (err) {
        define = /* @__PURE__ */ __name(function define2(obj, key, value) {
          return obj[key] = value
        }, 'define')
      }
      /**
       *
       */
      function wrap(innerFn, outerFn, self, tryLocsList) {
        const protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator; const generator = Object.create(protoGenerator.prototype); const context = new Context(tryLocsList || [])
        return defineProperty(generator, '_invoke', {value: makeInvokeMethod(innerFn, self, context)}), generator
      }
      __name(wrap, 'wrap')
      /**
       *
       */
      function tryCatch(fn, obj, arg) {
        try {
          return {type: 'normal', arg: fn.call(obj, arg)}
        } catch (err) {
          return {type: 'throw', arg: err}
        }
      }
      __name(tryCatch, 'tryCatch')
      exports2.wrap = wrap
      const ContinueSentinel = {}
      /**
       *
       */
      function Generator() {
      }
      __name(Generator, 'Generator')
      /**
       *
       */
      function GeneratorFunction() {
      }
      __name(GeneratorFunction, 'GeneratorFunction')
      /**
       *
       */
      function GeneratorFunctionPrototype() {
      }
      __name(GeneratorFunctionPrototype, 'GeneratorFunctionPrototype')
      let IteratorPrototype = {}
      define(IteratorPrototype, iteratorSymbol, function() {
        return this
      })
      const getProto = Object.getPrototypeOf; const NativeIteratorPrototype = getProto && getProto(getProto(values([])))
      NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol) && (IteratorPrototype = NativeIteratorPrototype)
      const Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype)
      /**
       *
       */
      function defineIteratorMethods(prototype) {
        ['next', 'throw', 'return'].forEach(function(method) {
          define(prototype, method, function(arg) {
            return this._invoke(method, arg)
          })
        })
      }
      __name(defineIteratorMethods, 'defineIteratorMethods')
      /**
       *
       */
      function AsyncIterator(generator, PromiseImpl) {
        /**
         *
         */
        function invoke(method, arg, resolve, reject) {
          const record = tryCatch(generator[method], generator, arg)
          if (record.type !== 'throw') {
            const result = record.arg; const value = result.value
            return value && _typeof(value) == 'object' && hasOwn.call(value, '__await') ? PromiseImpl.resolve(value.__await).then(function(value2) {
              invoke('next', value2, resolve, reject)
            }, function(err) {
              invoke('throw', err, resolve, reject)
            }) : PromiseImpl.resolve(value).then(function(unwrapped) {
              result.value = unwrapped, resolve(result)
            }, function(error) {
              return invoke('throw', error, resolve, reject)
            })
          }
          reject(record.arg)
        }
        __name(invoke, 'invoke')
        let previousPromise
        defineProperty(this, '_invoke', {value: /* @__PURE__ */ __name(function value(method, arg) {
          /**
           *
           */
          function callInvokeWithMethodAndArg() {
            return new PromiseImpl(function(resolve, reject) {
              invoke(method, arg, resolve, reject)
            })
          }
          __name(callInvokeWithMethodAndArg, 'callInvokeWithMethodAndArg')
          return previousPromise = previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg()
        }, 'value')})
      }
      __name(AsyncIterator, 'AsyncIterator')
      /**
       *
       */
      function makeInvokeMethod(innerFn, self, context) {
        let state = 'suspendedStart'
        return function(method, arg) {
          if (state === 'executing') {
throw new Error('Generator is already running')
}
          if (state === 'completed') {
            if (method === 'throw') {
throw arg
}
            return doneResult()
          }
          for (context.method = method, context.arg = arg; ; ) {
            const delegate = context.delegate
            if (delegate) {
              const delegateResult = maybeInvokeDelegate(delegate, context)
              if (delegateResult) {
                if (delegateResult === ContinueSentinel) {
continue
}
                return delegateResult
              }
            }
            if (context.method === 'next') {
context.sent = context._sent = context.arg
} else if (context.method === 'throw') {
              if (state === 'suspendedStart') {
throw state = 'completed', context.arg
}
              context.dispatchException(context.arg)
            } else {
context.method === 'return' && context.abrupt('return', context.arg)
}
            state = 'executing'
            const record = tryCatch(innerFn, self, context)
            if (record.type === 'normal') {
              if (state = context.done ? 'completed' : 'suspendedYield', record.arg === ContinueSentinel) {
continue
}
              return {value: record.arg, done: context.done}
            }
            record.type === 'throw' && (state = 'completed', context.method = 'throw', context.arg = record.arg)
          }
        }
      }
      __name(makeInvokeMethod, 'makeInvokeMethod')
      /**
       *
       */
      function maybeInvokeDelegate(delegate, context) {
        const methodName = context.method; const method = delegate.iterator[methodName]
        if (void 0 === method) {
return context.delegate = null, methodName === 'throw' && delegate.iterator['return'] && (context.method = 'return', context.arg = void 0, maybeInvokeDelegate(delegate, context), context.method === 'throw') || methodName !== 'return' && (context.method = 'throw', context.arg = new TypeError(`The iterator does not provide a '${ methodName }' method`)), ContinueSentinel
}
        const record = tryCatch(method, delegate.iterator, context.arg)
        if (record.type === 'throw') {
return context.method = 'throw', context.arg = record.arg, context.delegate = null, ContinueSentinel
}
        const info = record.arg
        return info ? info.done ? (context[delegate.resultName] = info.value, context.next = delegate.nextLoc, context.method !== 'return' && (context.method = 'next', context.arg = void 0), context.delegate = null, ContinueSentinel) : info : (context.method = 'throw', context.arg = new TypeError('iterator result is not an object'), context.delegate = null, ContinueSentinel)
      }
      __name(maybeInvokeDelegate, 'maybeInvokeDelegate')
      /**
       *
       */
      function pushTryEntry(locs) {
        const entry = {tryLoc: locs[0]}
        1 in locs && (entry.catchLoc = locs[1]), 2 in locs && (entry.finallyLoc = locs[2], entry.afterLoc = locs[3]), this.tryEntries.push(entry)
      }
      __name(pushTryEntry, 'pushTryEntry')
      /**
       *
       */
      function resetTryEntry(entry) {
        const record = entry.completion || {}
        record.type = 'normal', delete record.arg, entry.completion = record
      }
      __name(resetTryEntry, 'resetTryEntry')
      /**
       *
       */
      function Context(tryLocsList) {
        this.tryEntries = [{tryLoc: 'root'}], tryLocsList.forEach(pushTryEntry, this), this.reset(true)
      }
      __name(Context, 'Context')
      /**
       *
       */
      function values(iterable) {
        if (iterable) {
          const iteratorMethod = iterable[iteratorSymbol]
          if (iteratorMethod) {
return iteratorMethod.call(iterable)
}
          if (typeof iterable.next === 'function') {
return iterable
}
          if (!isNaN(iterable.length)) {
            let i = -1; const next = /* @__PURE__ */ __name(function next2() {
              for (; ++i < iterable.length; ) {
if (hasOwn.call(iterable, i)) {
return next2.value = iterable[i], next2.done = false, next2
}
}
              return next2.value = void 0, next2.done = true, next2
            }, 'next')
            return next.next = next
          }
        }
        return {next: doneResult}
      }
      __name(values, 'values')
      /**
       *
       */
      function doneResult() {
        return {value: void 0, done: true}
      }
      __name(doneResult, 'doneResult')
      return GeneratorFunction.prototype = GeneratorFunctionPrototype, defineProperty(Gp, 'constructor', {value: GeneratorFunctionPrototype, configurable: true}), defineProperty(GeneratorFunctionPrototype, 'constructor', {value: GeneratorFunction, configurable: true}), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, 'GeneratorFunction'), exports2.isGeneratorFunction = function(genFun) {
        const ctor = typeof genFun === 'function' && genFun.constructor
        return !!ctor && (ctor === GeneratorFunction || (ctor.displayName || ctor.name) === 'GeneratorFunction')
      }, exports2.mark = function(genFun) {
        return Object.setPrototypeOf ? Object.setPrototypeOf(genFun, GeneratorFunctionPrototype) : (genFun.__proto__ = GeneratorFunctionPrototype, define(genFun, toStringTagSymbol, 'GeneratorFunction')), genFun.prototype = Object.create(Gp), genFun
      }, exports2.awrap = function(arg) {
        return {__await: arg}
      }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, asyncIteratorSymbol, function() {
        return this
      }), exports2.AsyncIterator = AsyncIterator, exports2.async = function(innerFn, outerFn, self, tryLocsList, PromiseImpl) {
        void 0 === PromiseImpl && (PromiseImpl = Promise)
        const iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl)
        return exports2.isGeneratorFunction(outerFn) ? iter : iter.next().then(function(result) {
          return result.done ? result.value : iter.next()
        })
      }, defineIteratorMethods(Gp), define(Gp, toStringTagSymbol, 'Generator'), define(Gp, iteratorSymbol, function() {
        return this
      }), define(Gp, 'toString', function() {
        return '[object Generator]'
      }), exports2.keys = function(val) {
        const object = Object(val); const keys = []
        for (const key in object) {
keys.push(key)
}
        return keys.reverse(), /* @__PURE__ */ __name(function next() {
          for (; keys.length; ) {
            const key2 = keys.pop()
            if (key2 in object) {
return next.value = key2, next.done = false, next
}
          }
          return next.done = true, next
        }, 'next')
      }, exports2.values = values, Context.prototype = {constructor: Context, reset: /* @__PURE__ */ __name(function reset(skipTempReset) {
        if (this.prev = 0, this.next = 0, this.sent = this._sent = void 0, this.done = false, this.delegate = null, this.method = 'next', this.arg = void 0, this.tryEntries.forEach(resetTryEntry), !skipTempReset) {
for (const name in this) {
name.charAt(0) === 't' && hasOwn.call(this, name) && !isNaN(+name.slice(1)) && (this[name] = void 0)
}
}
      }, 'reset'), stop: /* @__PURE__ */ __name(function stop() {
        this.done = true
        const rootRecord = this.tryEntries[0].completion
        if (rootRecord.type === 'throw') {
throw rootRecord.arg
}
        return this.rval
      }, 'stop'), dispatchException: /* @__PURE__ */ __name(function dispatchException(exception) {
        if (this.done) {
throw exception
}
        const context = this
        /**
         *
         */
        function handle(loc, caught) {
          return record.type = 'throw', record.arg = exception, context.next = loc, caught && (context.method = 'next', context.arg = void 0), !!caught
        }
        __name(handle, 'handle')
        for (let i = this.tryEntries.length - 1; i >= 0; --i) {
          const entry = this.tryEntries[i]; var record = entry.completion
          if (entry.tryLoc === 'root') {
return handle('end')
}
          if (entry.tryLoc <= this.prev) {
            const hasCatch = hasOwn.call(entry, 'catchLoc'); const hasFinally = hasOwn.call(entry, 'finallyLoc')
            if (hasCatch && hasFinally) {
              if (this.prev < entry.catchLoc) {
return handle(entry.catchLoc, true)
}
              if (this.prev < entry.finallyLoc) {
return handle(entry.finallyLoc)
}
            } else if (hasCatch) {
              if (this.prev < entry.catchLoc) {
return handle(entry.catchLoc, true)
}
            } else {
              if (!hasFinally) {
throw new Error('try statement without catch or finally')
}
              if (this.prev < entry.finallyLoc) {
return handle(entry.finallyLoc)
}
            }
          }
        }
      }, 'dispatchException'), abrupt: /* @__PURE__ */ __name(function abrupt(type, arg) {
        for (let i = this.tryEntries.length - 1; i >= 0; --i) {
          const entry = this.tryEntries[i]
          if (entry.tryLoc <= this.prev && hasOwn.call(entry, 'finallyLoc') && this.prev < entry.finallyLoc) {
            var finallyEntry = entry
            break
          }
        }
        finallyEntry && (type === 'break' || type === 'continue') && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc && (finallyEntry = null)
        const record = finallyEntry ? finallyEntry.completion : {}
        return record.type = type, record.arg = arg, finallyEntry ? (this.method = 'next', this.next = finallyEntry.finallyLoc, ContinueSentinel) : this.complete(record)
      }, 'abrupt'), complete: /* @__PURE__ */ __name(function complete(record, afterLoc) {
        if (record.type === 'throw') {
throw record.arg
}
        return record.type === 'break' || record.type === 'continue' ? this.next = record.arg : record.type === 'return' ? (this.rval = this.arg = record.arg, this.method = 'return', this.next = 'end') : record.type === 'normal' && afterLoc && (this.next = afterLoc), ContinueSentinel
      }, 'complete'), finish: /* @__PURE__ */ __name(function finish(finallyLoc) {
        for (let i = this.tryEntries.length - 1; i >= 0; --i) {
          const entry = this.tryEntries[i]
          if (entry.finallyLoc === finallyLoc) {
return this.complete(entry.completion, entry.afterLoc), resetTryEntry(entry), ContinueSentinel
}
        }
      }, 'finish'), catch: /* @__PURE__ */ __name(function _catch(tryLoc) {
        for (let i = this.tryEntries.length - 1; i >= 0; --i) {
          const entry = this.tryEntries[i]
          if (entry.tryLoc === tryLoc) {
            const record = entry.completion
            if (record.type === 'throw') {
              var thrown = record.arg
              resetTryEntry(entry)
            }
            return thrown
          }
        }
        throw new Error('illegal catch attempt')
      }, '_catch'), delegateYield: /* @__PURE__ */ __name(function delegateYield(iterable, resultName, nextLoc) {
        return this.delegate = {iterator: values(iterable), resultName, nextLoc}, this.method === 'next' && (this.arg = void 0), ContinueSentinel
      }, 'delegateYield')}, exports2
    }
    __name(_regeneratorRuntime, '_regeneratorRuntime')
    /**
     *
     */
    function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
      try {
        var info = gen[key](arg)
        var value = info.value
      } catch (error) {
        reject(error)
        return
      }
      if (info.done) {
        resolve(value)
      } else {
        Promise.resolve(value).then(_next, _throw)
      }
    }
    __name(asyncGeneratorStep, 'asyncGeneratorStep')
    /**
     *
     */
    function _asyncToGenerator(fn) {
      return function() {
        const self = this; const args = arguments
        return new Promise(function(resolve, reject) {
          const gen = fn.apply(self, args)
          /**
           *
           */
          function _next(value) {
            asyncGeneratorStep(gen, resolve, reject, _next, _throw, 'next', value)
          }
          __name(_next, '_next')
          /**
           *
           */
          function _throw(err) {
            asyncGeneratorStep(gen, resolve, reject, _next, _throw, 'throw', err)
          }
          __name(_throw, '_throw')
          _next(void 0)
        })
      }
    }
    __name(_asyncToGenerator, '_asyncToGenerator')
    /**
     *
     */
    function ownKeys(object, enumerableOnly) {
      const keys = Object.keys(object)
      if (Object.getOwnPropertySymbols) {
        let symbols = Object.getOwnPropertySymbols(object)
        enumerableOnly && (symbols = symbols.filter(function(sym) {
          return Object.getOwnPropertyDescriptor(object, sym).enumerable
        })), keys.push.apply(keys, symbols)
      }
      return keys
    }
    __name(ownKeys, 'ownKeys')
    /**
     *
     */
    function _objectSpread(target) {
      for (let i = 1; i < arguments.length; i++) {
        var source = arguments[i] != null ? arguments[i] : {}
        i % 2 ? ownKeys(Object(source), true).forEach(function(key) {
          _defineProperty(target, key, source[key])
        }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function(key) {
          Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key))
        })
      }
      return target
    }
    __name(_objectSpread, '_objectSpread')
    /**
     *
     */
    function _defineProperty(obj, key, value) {
      key = _toPropertyKey(key)
      if (key in obj) {
        Object.defineProperty(obj, key, {value, enumerable: true, configurable: true, writable: true})
      } else {
        obj[key] = value
      }
      return obj
    }
    __name(_defineProperty, '_defineProperty')
    /**
     *
     */
    function _defineProperties(target, props) {
      for (let i = 0; i < props.length; i++) {
        const descriptor = props[i]
        descriptor.enumerable = descriptor.enumerable || false
        descriptor.configurable = true
        if ('value' in descriptor) {
descriptor.writable = true
}
        Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor)
      }
    }
    __name(_defineProperties, '_defineProperties')
    /**
     *
     */
    function _createClass(Constructor, protoProps, staticProps) {
      if (protoProps) {
_defineProperties(Constructor.prototype, protoProps)
}
      if (staticProps) {
_defineProperties(Constructor, staticProps)
}
      Object.defineProperty(Constructor, 'prototype', {writable: false})
      return Constructor
    }
    __name(_createClass, '_createClass')
    /**
     *
     */
    function _toPropertyKey(arg) {
      const key = _toPrimitive(arg, 'string')
      return _typeof(key) === 'symbol' ? key : String(key)
    }
    __name(_toPropertyKey, '_toPropertyKey')
    /**
     *
     */
    function _toPrimitive(input, hint) {
      if (_typeof(input) !== 'object' || input === null) {
return input
}
      const prim = input[Symbol.toPrimitive]
      if (prim !== void 0) {
        const res = prim.call(input, hint || 'default')
        if (_typeof(res) !== 'object') {
return res
}
        throw new TypeError('@@toPrimitive must return a primitive value.')
      }
      return (hint === 'string' ? String : Number)(input)
    }
    __name(_toPrimitive, '_toPrimitive')
    /**
     *
     */
    function _classCallCheck(instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError('Cannot call a class as a function')
      }
    }
    __name(_classCallCheck, '_classCallCheck')
    /**
     *
     */
    function _inherits(subClass, superClass) {
      if (typeof superClass !== 'function' && superClass !== null) {
        throw new TypeError('Super expression must either be null or a function')
      }
      subClass.prototype = Object.create(superClass && superClass.prototype, {constructor: {value: subClass, writable: true, configurable: true}})
      Object.defineProperty(subClass, 'prototype', {writable: false})
      if (superClass) {
_setPrototypeOf(subClass, superClass)
}
    }
    __name(_inherits, '_inherits')
    /**
     *
     */
    function _createSuper(Derived) {
      const hasNativeReflectConstruct = _isNativeReflectConstruct()
      return /* @__PURE__ */ __name(function _createSuperInternal() {
        const Super = _getPrototypeOf(Derived); let result
        if (hasNativeReflectConstruct) {
          const NewTarget = _getPrototypeOf(this).constructor
          result = Reflect.construct(Super, arguments, NewTarget)
        } else {
          result = Super.apply(this, arguments)
        }
        return _possibleConstructorReturn(this, result)
      }, '_createSuperInternal')
    }
    __name(_createSuper, '_createSuper')
    /**
     *
     */
    function _possibleConstructorReturn(self, call) {
      if (call && (_typeof(call) === 'object' || typeof call === 'function')) {
        return call
      } else if (call !== void 0) {
        throw new TypeError('Derived constructors may only return object or undefined')
      }
      return _assertThisInitialized(self)
    }
    __name(_possibleConstructorReturn, '_possibleConstructorReturn')
    /**
     *
     */
    function _assertThisInitialized(self) {
      if (self === void 0) {
        throw new ReferenceError('this hasn\'t been initialised - super() hasn\'t been called')
      }
      return self
    }
    __name(_assertThisInitialized, '_assertThisInitialized')
    /**
     *
     */
    function _wrapNativeSuper(Class) {
      const _cache = typeof Map === 'function' ? /* @__PURE__ */ new Map() : void 0
      _wrapNativeSuper = /* @__PURE__ */ __name(function _wrapNativeSuper2(Class2) {
        if (Class2 === null || !_isNativeFunction(Class2)) {
return Class2
}
        if (typeof Class2 !== 'function') {
          throw new TypeError('Super expression must either be null or a function')
        }
        if (typeof _cache !== 'undefined') {
          if (_cache.has(Class2)) {
return _cache.get(Class2)
}
          _cache.set(Class2, Wrapper)
        }
        /**
         *
         */
        function Wrapper() {
          return _construct(Class2, arguments, _getPrototypeOf(this).constructor)
        }
        __name(Wrapper, 'Wrapper')
        Wrapper.prototype = Object.create(Class2.prototype, {constructor: {value: Wrapper, enumerable: false, writable: true, configurable: true}})
        return _setPrototypeOf(Wrapper, Class2)
      }, '_wrapNativeSuper')
      return _wrapNativeSuper(Class)
    }
    __name(_wrapNativeSuper, '_wrapNativeSuper')
    /**
     *
     */
    function _construct(Parent, args, Class) {
      if (_isNativeReflectConstruct()) {
        _construct = Reflect.construct.bind()
      } else {
        _construct = /* @__PURE__ */ __name(function _construct2(Parent2, args2, Class2) {
          const a = [null]
          a.push.apply(a, args2)
          const Constructor = Function.bind.apply(Parent2, a)
          const instance = new Constructor()
          if (Class2) {
_setPrototypeOf(instance, Class2.prototype)
}
          return instance
        }, '_construct')
      }
      return _construct.apply(null, arguments)
    }
    __name(_construct, '_construct')
    /**
     *
     */
    function _isNativeReflectConstruct() {
      if (typeof Reflect === 'undefined' || !Reflect.construct) {
return false
}
      if (Reflect.construct.sham) {
return false
}
      if (typeof Proxy === 'function') {
return true
}
      try {
        Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
        }))
        return true
      } catch (e) {
        return false
      }
    }
    __name(_isNativeReflectConstruct, '_isNativeReflectConstruct')
    /**
     *
     */
    function _isNativeFunction(fn) {
      return Function.toString.call(fn).indexOf('[native code]') !== -1
    }
    __name(_isNativeFunction, '_isNativeFunction')
    /**
     *
     */
    function _setPrototypeOf(o, p) {
      _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : /* @__PURE__ */ __name(function _setPrototypeOf2(o2, p2) {
        o2.__proto__ = p2
        return o2
      }, '_setPrototypeOf')
      return _setPrototypeOf(o, p)
    }
    __name(_setPrototypeOf, '_setPrototypeOf')
    /**
     *
     */
    function _getPrototypeOf(o) {
      _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : /* @__PURE__ */ __name(function _getPrototypeOf2(o2) {
        return o2.__proto__ || Object.getPrototypeOf(o2)
      }, '_getPrototypeOf')
      return _getPrototypeOf(o)
    }
    __name(_getPrototypeOf, '_getPrototypeOf')
    /**
     *
     */
    function _awaitAsyncGenerator(value) {
      return new _OverloadYield(value, 0)
    }
    __name(_awaitAsyncGenerator, '_awaitAsyncGenerator')
    /**
     *
     */
    function _wrapAsyncGenerator(fn) {
      return function() {
        return new _AsyncGenerator(fn.apply(this, arguments))
      }
    }
    __name(_wrapAsyncGenerator, '_wrapAsyncGenerator')
    /**
     *
     */
    function _AsyncGenerator(gen) {
      let front; let back
      /**
       *
       */
      function resume(key, arg) {
        try {
          const result = gen[key](arg); const value = result.value; const overloaded = value instanceof _OverloadYield
          Promise.resolve(overloaded ? value.v : value).then(function(arg2) {
            if (overloaded) {
              const nextKey = key === 'return' ? 'return' : 'next'
              if (!value.k || arg2.done) {
return resume(nextKey, arg2)
}
              arg2 = gen[nextKey](arg2).value
            }
            settle(result.done ? 'return' : 'normal', arg2)
          }, function(err) {
            resume('throw', err)
          })
        } catch (err) {
          settle('throw', err)
        }
      }
      __name(resume, 'resume')
      /**
       *
       */
      function settle(type, value) {
        switch (type) {
          case 'return':
            front.resolve({value, done: true})
            break
          case 'throw':
            front.reject(value)
            break
          default:
            front.resolve({value, done: false})
        }
        (front = front.next) ? resume(front.key, front.arg) : back = null
      }
      __name(settle, 'settle')
      this._invoke = function(key, arg) {
        return new Promise(function(resolve, reject) {
          const request = {key, arg, resolve, reject, next: null}
          back ? back = back.next = request : (front = back = request, resume(key, arg))
        })
      }, typeof gen['return'] !== 'function' && (this['return'] = void 0)
    }
    __name(_AsyncGenerator, '_AsyncGenerator')
    _AsyncGenerator.prototype[typeof Symbol === 'function' && Symbol.asyncIterator || '@@asyncIterator'] = function() {
      return this
    }, _AsyncGenerator.prototype.next = function(arg) {
      return this._invoke('next', arg)
    }, _AsyncGenerator.prototype['throw'] = function(arg) {
      return this._invoke('throw', arg)
    }, _AsyncGenerator.prototype['return'] = function(arg) {
      return this._invoke('return', arg)
    }
    /**
     *
     */
    function _OverloadYield(value, kind) {
      this.v = value, this.k = kind
    }
    __name(_OverloadYield, '_OverloadYield')
    const WidgetApiResponseError = /* @__PURE__ */ function(_Error) {
      _inherits(WidgetApiResponseError2, _Error)
      const _super = _createSuper(WidgetApiResponseError2)
      /**
       *
       */
      function WidgetApiResponseError2(message, data) {
        let _this2
        _classCallCheck(this, WidgetApiResponseError2)
        _this2 = _super.call(this, message)
        _this2.data = data
        return _this2
      }
      __name(WidgetApiResponseError2, 'WidgetApiResponseError')
      return _createClass(WidgetApiResponseError2)
    }(/* @__PURE__ */ _wrapNativeSuper(Error))
    exports.WidgetApiResponseError = WidgetApiResponseError
    WidgetApiResponseError.prototype.name = WidgetApiResponseError.name
    const WidgetApi = /* @__PURE__ */ function(_EventEmitter) {
      _inherits(WidgetApi2, _EventEmitter)
      const _super2 = _createSuper(WidgetApi2)
      /**
       *
       */
      function WidgetApi2() {
        let _this3
        const widgetId = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : null
        const clientOrigin = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : null
        _classCallCheck(this, WidgetApi2)
        _this3 = _super2.call(this)
        _this3.clientOrigin = clientOrigin
        _defineProperty(_assertThisInitialized(_this3), 'transport', void 0)
        _defineProperty(_assertThisInitialized(_this3), 'capabilitiesFinished', false)
        _defineProperty(_assertThisInitialized(_this3), 'supportsMSC2974Renegotiate', false)
        _defineProperty(_assertThisInitialized(_this3), 'requestedCapabilities', [])
        _defineProperty(_assertThisInitialized(_this3), 'approvedCapabilities', void 0)
        _defineProperty(_assertThisInitialized(_this3), 'cachedClientVersions', void 0)
        _defineProperty(_assertThisInitialized(_this3), 'turnServerWatchers', 0)
        if (!window.parent) {
          throw new Error('No parent window. This widget doesn\'t appear to be embedded properly.')
        }
        _this3.transport = new _PostmessageTransport.PostmessageTransport(_WidgetApiDirection.WidgetApiDirection.FromWidget, widgetId, window.parent, window)
        _this3.transport.targetOrigin = clientOrigin
        _this3.transport.on('message', _this3.handleMessage.bind(_assertThisInitialized(_this3)))
        return _this3
      }
      __name(WidgetApi2, 'WidgetApi')
      _createClass(WidgetApi2, [{
        key: 'hasCapability',
        value: /* @__PURE__ */ __name(function hasCapability(capability) {
          if (Array.isArray(this.approvedCapabilities)) {
            return this.approvedCapabilities.includes(capability)
          }
          return this.requestedCapabilities.includes(capability)
        }, 'hasCapability'),
        /**
         * Request a capability from the client. It is not guaranteed to be allowed,
         * but will be asked for.
         *
         * @param {Capability} capability The capability to request.
         * @throws Throws if the capabilities negotiation has already started and the
         * widget is unable to request additional capabilities.
         */
      }, {
        key: 'requestCapability',
        value: /* @__PURE__ */ __name(function requestCapability(capability) {
          if (this.capabilitiesFinished && !this.supportsMSC2974Renegotiate) {
            throw new Error('Capabilities have already been negotiated')
          }
          this.requestedCapabilities.push(capability)
        }, 'requestCapability'),
        /**
         * Request capabilities from the client. They are not guaranteed to be allowed,
         * but will be asked for if the negotiation has not already happened.
         *
         * @param {Capability[]} capabilities The capabilities to request.
         * @throws Throws if the capabilities negotiation has already started.
         */
      }, {
        key: 'requestCapabilities',
        value: /* @__PURE__ */ __name(function requestCapabilities(capabilities) {
          const _this4 = this
          capabilities.forEach(function(cap) {
            return _this4.requestCapability(cap)
          })
        }, 'requestCapabilities'),
        /**
         * Requests the capability to interact with rooms other than the user's currently
         * viewed room. Applies to event receiving and sending.
         *
         * @param {string | Symbols.AnyRoom} roomId The room ID, or `Symbols.AnyRoom` to
         * denote all known rooms.
         */
      }, {
        key: 'requestCapabilityForRoomTimeline',
        value: /* @__PURE__ */ __name(function requestCapabilityForRoomTimeline(roomId) {
          this.requestCapability('org.matrix.msc2762.timeline:'.concat(roomId))
        }, 'requestCapabilityForRoomTimeline'),
        /**
         * Requests the capability to send a given state event with optional explicit
         * state key. It is not guaranteed to be allowed, but will be asked for if the
         * negotiation has not already happened.
         *
         * @param {string} eventType The state event type to ask for.
         * @param {string} stateKey If specified, the specific state key to request.
         * Otherwise all state keys will be requested.
         */
      }, {
        key: 'requestCapabilityToSendState',
        value: /* @__PURE__ */ __name(function requestCapabilityToSendState(eventType, stateKey) {
          this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forStateEvent(_WidgetEventCapability.EventDirection.Send, eventType, stateKey).raw)
        }, 'requestCapabilityToSendState'),
        /**
         * Requests the capability to receive a given state event with optional explicit
         * state key. It is not guaranteed to be allowed, but will be asked for if the
         * negotiation has not already happened.
         *
         * @param {string} eventType The state event type to ask for.
         * @param {string} stateKey If specified, the specific state key to request.
         * Otherwise all state keys will be requested.
         */
      }, {
        key: 'requestCapabilityToReceiveState',
        value: /* @__PURE__ */ __name(function requestCapabilityToReceiveState(eventType, stateKey) {
          this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forStateEvent(_WidgetEventCapability.EventDirection.Receive, eventType, stateKey).raw)
        }, 'requestCapabilityToReceiveState'),
        /**
         * Requests the capability to send a given to-device event. It is not
         * guaranteed to be allowed, but will be asked for if the negotiation has
         * not already happened.
         *
         * @param {string} eventType The room event type to ask for.
         */
      }, {
        key: 'requestCapabilityToSendToDevice',
        value: /* @__PURE__ */ __name(function requestCapabilityToSendToDevice(eventType) {
          this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forToDeviceEvent(_WidgetEventCapability.EventDirection.Send, eventType).raw)
        }, 'requestCapabilityToSendToDevice'),
        /**
         * Requests the capability to receive a given to-device event. It is not
         * guaranteed to be allowed, but will be asked for if the negotiation has
         * not already happened.
         *
         * @param {string} eventType The room event type to ask for.
         */
      }, {
        key: 'requestCapabilityToReceiveToDevice',
        value: /* @__PURE__ */ __name(function requestCapabilityToReceiveToDevice(eventType) {
          this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forToDeviceEvent(_WidgetEventCapability.EventDirection.Receive, eventType).raw)
        }, 'requestCapabilityToReceiveToDevice'),
        /**
         * Requests the capability to send a given room event. It is not guaranteed to be
         * allowed, but will be asked for if the negotiation has not already happened.
         *
         * @param {string} eventType The room event type to ask for.
         */
      }, {
        key: 'requestCapabilityToSendEvent',
        value: /* @__PURE__ */ __name(function requestCapabilityToSendEvent(eventType) {
          this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forRoomEvent(_WidgetEventCapability.EventDirection.Send, eventType).raw)
        }, 'requestCapabilityToSendEvent'),
        /**
         * Requests the capability to receive a given room event. It is not guaranteed to be
         * allowed, but will be asked for if the negotiation has not already happened.
         *
         * @param {string} eventType The room event type to ask for.
         */
      }, {
        key: 'requestCapabilityToReceiveEvent',
        value: /* @__PURE__ */ __name(function requestCapabilityToReceiveEvent(eventType) {
          this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forRoomEvent(_WidgetEventCapability.EventDirection.Receive, eventType).raw)
        }, 'requestCapabilityToReceiveEvent'),
        /**
         * Requests the capability to send a given message event with optional explicit
         * `msgtype`. It is not guaranteed to be allowed, but will be asked for if the
         * negotiation has not already happened.
         *
         * @param {string} msgtype If specified, the specific msgtype to request.
         * Otherwise all message types will be requested.
         */
      }, {
        key: 'requestCapabilityToSendMessage',
        value: /* @__PURE__ */ __name(function requestCapabilityToSendMessage(msgtype) {
          this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forRoomMessageEvent(_WidgetEventCapability.EventDirection.Send, msgtype).raw)
        }, 'requestCapabilityToSendMessage'),
        /**
         * Requests the capability to receive a given message event with optional explicit
         * `msgtype`. It is not guaranteed to be allowed, but will be asked for if the
         * negotiation has not already happened.
         *
         * @param {string} msgtype If specified, the specific msgtype to request.
         * Otherwise all message types will be requested.
         */
      }, {
        key: 'requestCapabilityToReceiveMessage',
        value: /* @__PURE__ */ __name(function requestCapabilityToReceiveMessage(msgtype) {
          this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forRoomMessageEvent(_WidgetEventCapability.EventDirection.Receive, msgtype).raw)
        }, 'requestCapabilityToReceiveMessage'),
        /**
         * Requests the capability to receive a given item in room account data. It is not guaranteed to be
         * allowed, but will be asked for if the negotiation has not already happened.
         *
         * @param {string} eventType The state event type to ask for.
         */
      }, {
        key: 'requestCapabilityToReceiveRoomAccountData',
        value: /* @__PURE__ */ __name(function requestCapabilityToReceiveRoomAccountData(eventType) {
          this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forRoomAccountData(_WidgetEventCapability.EventDirection.Receive, eventType).raw)
        }, 'requestCapabilityToReceiveRoomAccountData'),
        /**
         * Requests an OpenID Connect token from the client for the currently logged in
         * user. This token can be validated server-side with the federation API. Note
         * that the widget is responsible for validating the token and caching any results
         * it needs.
         *
         * @return {Promise<IOpenIDCredentials>} Resolves to a token for verification.
         * @throws Throws if the user rejected the request or the request failed.
         */
      }, {
        key: 'requestOpenIDConnectToken',
        value: /* @__PURE__ */ __name(function requestOpenIDConnectToken() {
          const _this5 = this
          return new Promise(function(resolve, reject) {
            _this5.transport.sendComplete(_WidgetApiAction.WidgetApiFromWidgetAction.GetOpenIDCredentials, {}).then(function(response) {
              const rdata = response.response
              if (rdata.state === _GetOpenIDAction.OpenIDRequestState.Allowed) {
                resolve(rdata)
              } else if (rdata.state === _GetOpenIDAction.OpenIDRequestState.Blocked) {
                reject(new Error('User declined to verify their identity'))
              } else if (rdata.state === _GetOpenIDAction.OpenIDRequestState.PendingUserConfirmation) {
                const handlerFn = /* @__PURE__ */ __name(function handlerFn2(ev) {
                  ev.preventDefault()
                  const request = ev.detail
                  if (request.data.original_request_id !== response.requestId) {
return
}
                  if (request.data.state === _GetOpenIDAction.OpenIDRequestState.Allowed) {
                    resolve(request.data)
                    _this5.transport.reply(request, {})
                  } else if (request.data.state === _GetOpenIDAction.OpenIDRequestState.Blocked) {
                    reject(new Error('User declined to verify their identity'))
                    _this5.transport.reply(request, {})
                  } else {
                    reject(new Error(`Invalid state on reply: ${ rdata.state}`))
                    _this5.transport.reply(request, {
                      error: {
                        message: 'Invalid state',
                      },
                    })
                  }
                  _this5.off('action:'.concat(_WidgetApiAction.WidgetApiToWidgetAction.OpenIDCredentials), handlerFn2)
                }, 'handlerFn')
                _this5.on('action:'.concat(_WidgetApiAction.WidgetApiToWidgetAction.OpenIDCredentials), handlerFn)
              } else {
                reject(new Error(`Invalid state: ${ rdata.state}`))
              }
            })['catch'](reject)
          })
        }, 'requestOpenIDConnectToken'),
        /**
         * Asks the client for additional capabilities. Capabilities can be queued for this
         * request with the requestCapability() functions.
         *
         * @return {Promise<void>} Resolves when complete. Note that the promise resolves when
         * the capabilities request has gone through, not when the capabilities are approved/denied.
         * Use the WidgetApiToWidgetAction.NotifyCapabilities action to detect changes.
         */
      }, {
        key: 'updateRequestedCapabilities',
        value: /* @__PURE__ */ __name(function updateRequestedCapabilities() {
          return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.MSC2974RenegotiateCapabilities, {
            capabilities: this.requestedCapabilities,
          }).then()
        }, 'updateRequestedCapabilities'),
        /**
         * Tell the client that the content has been loaded.
         *
         * @return {Promise} Resolves when the client acknowledges the request.
         */
      }, {
        key: 'sendContentLoaded',
        value: /* @__PURE__ */ __name(function sendContentLoaded() {
          return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.ContentLoaded, {}).then()
        }, 'sendContentLoaded'),
        /**
         * Sends a sticker to the client.
         *
         * @param {IStickerActionRequestData} sticker The sticker to send.
         * @return {Promise} Resolves when the client acknowledges the request.
         */
      }, {
        key: 'sendSticker',
        value: /* @__PURE__ */ __name(function sendSticker(sticker) {
          return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.SendSticker, sticker).then()
        }, 'sendSticker'),
        /**
         * Asks the client to set the always-on-screen status for this widget.
         *
         * @param {boolean} value The new state to request.
         * @return {Promise<boolean>} Resolve with true if the client was able to fulfill
         * the request, resolves to false otherwise. Rejects if an error occurred.
         */
      }, {
        key: 'setAlwaysOnScreen',
        value: /* @__PURE__ */ __name(function setAlwaysOnScreen(value) {
          return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.UpdateAlwaysOnScreen, {
            value,
          }).then(function(res) {
            return res.success
          })
        }, 'setAlwaysOnScreen'),
        /**
         * Opens a modal widget.
         *
         * @param {string} url The URL to the modal widget.
         * @param {string} name The name of the widget.
         * @param {IModalWidgetOpenRequestDataButton[]} buttons The buttons to have on the widget.
         * @param {IModalWidgetCreateData} data Data to supply to the modal widget.
         * @param {WidgetType} type The type of modal widget.
         * @return {Promise<void>} Resolves when the modal widget has been opened.
         */
      }, {
        key: 'openModalWidget',
        value: /* @__PURE__ */ __name(function openModalWidget(url, name) {
          const buttons = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : []
          const data = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : {}
          const type = arguments.length > 4 && arguments[4] !== void 0 ? arguments[4] : _WidgetType.MatrixWidgetType.Custom
          return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.OpenModalWidget, {
            type,
            url,
            name,
            buttons,
            data,
          }).then()
        }, 'openModalWidget'),
        /**
         * Closes the modal widget. The widget's session will be terminated shortly after.
         *
         * @param {IModalWidgetReturnData} data Optional data to close the modal widget with.
         * @return {Promise<void>} Resolves when complete.
         */
      }, {
        key: 'closeModalWidget',
        value: /* @__PURE__ */ __name(function closeModalWidget() {
          const data = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {}
          return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.CloseModalWidget, data).then()
        }, 'closeModalWidget'),
      }, {
        key: 'sendRoomEvent',
        value: /* @__PURE__ */ __name(function sendRoomEvent(eventType, content, roomId, delay, parentDelayId) {
          return this.sendEvent(eventType, void 0, content, roomId, delay, parentDelayId)
        }, 'sendRoomEvent'),
      }, {
        key: 'sendStateEvent',
        value: /* @__PURE__ */ __name(function sendStateEvent(eventType, stateKey, content, roomId, delay, parentDelayId) {
          return this.sendEvent(eventType, stateKey, content, roomId, delay, parentDelayId)
        }, 'sendStateEvent'),
      }, {
        key: 'sendEvent',
        value: /* @__PURE__ */ __name(function sendEvent(eventType, stateKey, content, roomId, delay, parentDelayId) {
          return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.SendEvent, _objectSpread(_objectSpread(_objectSpread(_objectSpread({
            type: eventType,
            content,
          }, stateKey !== void 0 && {
            state_key: stateKey,
          }), roomId !== void 0 && {
            room_id: roomId,
          }), delay !== void 0 && {
            delay,
          }), parentDelayId !== void 0 && {
            parent_delay_id: parentDelayId,
          }))
        }, 'sendEvent'),
        /**
         * @deprecated This currently relies on an unstable MSC (MSC4157).
         */
      }, {
        key: 'updateDelayedEvent',
        value: /* @__PURE__ */ __name(function updateDelayedEvent(delayId, action) {
          return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.MSC4157UpdateDelayedEvent, {
            delay_id: delayId,
            action,
          })
        }, 'updateDelayedEvent'),
        /**
         * Sends a to-device event.
         *
         * @param {string} eventType The type of events being sent.
         * @param {boolean} encrypted Whether to encrypt the message contents.
         * @param {object} contentMap A map from user IDs to device IDs to message contents.
         * @return {Promise<ISendToDeviceFromWidgetResponseData>} Resolves when complete.
         */
      }, {
        key: 'sendToDevice',
        value: /* @__PURE__ */ __name(function sendToDevice(eventType, encrypted, contentMap) {
          return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.SendToDevice, {
            type: eventType,
            encrypted,
            messages: contentMap,
          })
        }, 'sendToDevice'),
      }, {
        key: 'readRoomAccountData',
        value: /* @__PURE__ */ __name(function readRoomAccountData(eventType, roomIds) {
          const data = {
            type: eventType,
          }
          if (roomIds) {
            if (roomIds.includes(_Symbols.Symbols.AnyRoom)) {
              data.room_ids = _Symbols.Symbols.AnyRoom
            } else {
              data.room_ids = roomIds
            }
          }
          return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.BeeperReadRoomAccountData, data).then(function(r) {
            return r.events
          })
        }, 'readRoomAccountData'),
      }, {
        key: 'readRoomEvents',
        value: /* @__PURE__ */ __name(function readRoomEvents(eventType, limit, msgtype, roomIds, since) {
          const data = {
            type: eventType,
            msgtype,
          }
          if (limit !== void 0) {
            data.limit = limit
          }
          if (roomIds) {
            if (roomIds.includes(_Symbols.Symbols.AnyRoom)) {
              data.room_ids = _Symbols.Symbols.AnyRoom
            } else {
              data.room_ids = roomIds
            }
          }
          if (since) {
            data.since = since
          }
          return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.MSC2876ReadEvents, data).then(function(r) {
            return r.events
          })
        }, 'readRoomEvents'),
        /**
         * Reads all related events given a known eventId.
         *
         * @param eventId The id of the parent event to be read.
         * @param roomId The room to look within. When undefined, the user's currently
         * viewed room.
         * @param relationType The relationship type of child events to search for.
         * When undefined, all relations are returned.
         * @param eventType The event type of child events to search for. When undefined,
         * all related events are returned.
         * @param limit The maximum number of events to retrieve per room. If not
         * supplied, the server will apply a default limit.
         * @param from The pagination token to start returning results from, as
         * received from a previous call. If not supplied, results start at the most
         * recent topological event known to the server.
         * @param to The pagination token to stop returning results at. If not
         * supplied, results continue up to limit or until there are no more events.
         * @param direction The direction to search for according to MSC3715.
         * @return Resolves to the room relations.
         */
      }, {
        key: 'readEventRelations',
        value: function() {
          const _readEventRelations = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee(eventId, roomId, relationType, eventType, limit, from, to, direction) {
            let versions; let data
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee$(_context) {
              while (1) {
switch (_context.prev = _context.next) {
                  case 0:
                    _context.next = 2
                    return this.getClientVersions()
                  case 2:
                    versions = _context.sent
                    if (versions.includes(_ApiVersion.UnstableApiVersion.MSC3869)) {
                      _context.next = 5
                      break
                    }
                    throw new Error('The read_relations action is not supported by the client.')
                  case 5:
                    data = {
                      event_id: eventId,
                      rel_type: relationType,
                      event_type: eventType,
                      room_id: roomId,
                      to,
                      from,
                      limit,
                      direction,
                    }
                    return _context.abrupt('return', this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.MSC3869ReadRelations, data))
                  case 7:
                  case 'end':
                    return _context.stop()
                }
}
            }, '_callee$'), _callee, this)
          }, '_callee')))
          /**
           *
           */
          function readEventRelations(_x, _x2, _x3, _x4, _x5, _x6, _x7, _x8) {
            return _readEventRelations.apply(this, arguments)
          }
          __name(readEventRelations, 'readEventRelations')
          return readEventRelations
        }(),
      }, {
        key: 'readStateEvents',
        value: /* @__PURE__ */ __name(function readStateEvents(eventType, limit, stateKey, roomIds) {
          const data = {
            type: eventType,
            state_key: stateKey === void 0 ? true : stateKey,
          }
          if (limit !== void 0) {
            data.limit = limit
          }
          if (roomIds) {
            if (roomIds.includes(_Symbols.Symbols.AnyRoom)) {
              data.room_ids = _Symbols.Symbols.AnyRoom
            } else {
              data.room_ids = roomIds
            }
          }
          return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.MSC2876ReadEvents, data).then(function(r) {
            return r.events
          })
        }, 'readStateEvents'),
        /**
         * Sets a button as disabled or enabled on the modal widget. Buttons are enabled by default.
         *
         * @param {ModalButtonID} buttonId The button ID to enable/disable.
         * @param {boolean} isEnabled Whether or not the button is enabled.
         * @return {Promise<void>} Resolves when complete.
         * @throws Throws if the button cannot be disabled, or the client refuses to disable the button.
         */
      }, {
        key: 'setModalButtonEnabled',
        value: /* @__PURE__ */ __name(function setModalButtonEnabled(buttonId, isEnabled) {
          if (buttonId === _ModalWidgetActions.BuiltInModalButtonID.Close) {
            throw new Error('The close button cannot be disabled')
          }
          return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.SetModalButtonEnabled, {
            button: buttonId,
            enabled: isEnabled,
          }).then()
        }, 'setModalButtonEnabled'),
        /**
         * Attempts to navigate the client to the given URI. This can only be called with Matrix URIs
         * (currently only matrix.to, but in future a Matrix URI scheme will be defined).
         *
         * @param {string} uri The URI to navigate to.
         * @return {Promise<void>} Resolves when complete.
         * @throws Throws if the URI is invalid or cannot be processed.
         * @deprecated This currently relies on an unstable MSC (MSC2931).
         */
      }, {
        key: 'navigateTo',
        value: /* @__PURE__ */ __name(function navigateTo(uri) {
          if (!uri || !uri.startsWith('https://matrix.to/#')) {
            throw new Error('Invalid matrix.to URI')
          }
          return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.MSC2931Navigate, {
            uri,
          }).then()
        }, 'navigateTo'),
        /**
         * Starts watching for TURN servers, yielding an initial set of credentials as soon as possible,
         * and thereafter yielding new credentials whenever the previous ones expire.
         *
         * @yields {ITurnServer} The TURN server URIs and credentials currently available to the widget.
         */
      }, {
        key: 'getTurnServers',
        value: /* @__PURE__ */ __name(function getTurnServers() {
          const _this = this
          return _wrapAsyncGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee3() {
            let setTurnServer; let onUpdateTurnServers
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee3$(_context3) {
              while (1) {
switch (_context3.prev = _context3.next) {
                  case 0:
                    onUpdateTurnServers = /* @__PURE__ */ function() {
                      const _ref = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee2(ev) {
                        return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee2$(_context2) {
                          while (1) {
switch (_context2.prev = _context2.next) {
                              case 0:
                                ev.preventDefault()
                                setTurnServer(ev.detail.data)
                                _context2.next = 4
                                return _this.transport.reply(ev.detail, {})
                              case 4:
                              case 'end':
                                return _context2.stop()
                            }
}
                        }, '_callee2$'), _callee2)
                      }, '_callee2')))
                      return /* @__PURE__ */ __name(function onUpdateTurnServers2(_x9) {
                        return _ref.apply(this, arguments)
                      }, 'onUpdateTurnServers')
                    }()
                    _this.on('action:'.concat(_WidgetApiAction.WidgetApiToWidgetAction.UpdateTurnServers), onUpdateTurnServers)
                    if (!(_this.turnServerWatchers === 0)) {
                      _context3.next = 12
                      break
                    }
                    _context3.prev = 3
                    _context3.next = 6
                    return _awaitAsyncGenerator(_this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.WatchTurnServers, {}))
                  case 6:
                    _context3.next = 12
                    break
                  case 8:
                    _context3.prev = 8
                    _context3.t0 = _context3['catch'](3)
                    _this.off('action:'.concat(_WidgetApiAction.WidgetApiToWidgetAction.UpdateTurnServers), onUpdateTurnServers)
                    throw _context3.t0
                  case 12:
                    _this.turnServerWatchers++
                    _context3.prev = 13
                  case 14:
                    if (false) {
                      _context3.next = 21
                      break
                    }
                    _context3.next = 17
                    return _awaitAsyncGenerator(new Promise(function(resolve) {
                      return setTurnServer = resolve
                    }))
                  case 17:
                    _context3.next = 19
                    return _context3.sent
                  case 19:
                    _context3.next = 14
                    break
                  case 21:
                    _context3.prev = 21
                    _this.off('action:'.concat(_WidgetApiAction.WidgetApiToWidgetAction.UpdateTurnServers), onUpdateTurnServers)
                    _this.turnServerWatchers--
                    if (!(_this.turnServerWatchers === 0)) {
                      _context3.next = 27
                      break
                    }
                    _context3.next = 27
                    return _awaitAsyncGenerator(_this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.UnwatchTurnServers, {}))
                  case 27:
                    return _context3.finish(21)
                  case 28:
                  case 'end':
                    return _context3.stop()
                }
}
            }, '_callee3$'), _callee3, null, [[3, 8], [13, , 21, 28]])
          }, '_callee3')))()
        }, 'getTurnServers'),
        /**
         * Search for users in the user directory.
         *
         * @param searchTerm The term to search for.
         * @param limit The maximum number of results to return. If not supplied, the
         * @return Resolves to the search results.
         */
      }, {
        key: 'searchUserDirectory',
        value: function() {
          const _searchUserDirectory = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee4(searchTerm, limit) {
            let versions; let data
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee4$(_context4) {
              while (1) {
switch (_context4.prev = _context4.next) {
                  case 0:
                    _context4.next = 2
                    return this.getClientVersions()
                  case 2:
                    versions = _context4.sent
                    if (versions.includes(_ApiVersion.UnstableApiVersion.MSC3973)) {
                      _context4.next = 5
                      break
                    }
                    throw new Error('The user_directory_search action is not supported by the client.')
                  case 5:
                    data = {
                      search_term: searchTerm,
                      limit,
                    }
                    return _context4.abrupt('return', this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.MSC3973UserDirectorySearch, data))
                  case 7:
                  case 'end':
                    return _context4.stop()
                }
}
            }, '_callee4$'), _callee4, this)
          }, '_callee4')))
          /**
           *
           */
          function searchUserDirectory(_x10, _x11) {
            return _searchUserDirectory.apply(this, arguments)
          }
          __name(searchUserDirectory, 'searchUserDirectory')
          return searchUserDirectory
        }(),
        /**
         * Get the config for the media repository.
         *
         * @return Promise which resolves with an object containing the config.
         */
      }, {
        key: 'getMediaConfig',
        value: function() {
          const _getMediaConfig = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee5() {
            let versions; let data
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee5$(_context5) {
              while (1) {
switch (_context5.prev = _context5.next) {
                  case 0:
                    _context5.next = 2
                    return this.getClientVersions()
                  case 2:
                    versions = _context5.sent
                    if (versions.includes(_ApiVersion.UnstableApiVersion.MSC4039)) {
                      _context5.next = 5
                      break
                    }
                    throw new Error('The get_media_config action is not supported by the client.')
                  case 5:
                    data = {}
                    return _context5.abrupt('return', this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.MSC4039GetMediaConfigAction, data))
                  case 7:
                  case 'end':
                    return _context5.stop()
                }
}
            }, '_callee5$'), _callee5, this)
          }, '_callee5')))
          /**
           *
           */
          function getMediaConfig() {
            return _getMediaConfig.apply(this, arguments)
          }
          __name(getMediaConfig, 'getMediaConfig')
          return getMediaConfig
        }(),
        /**
         * Upload a file to the media repository on the homeserver.
         *
         * @param file - The object to upload. Something that can be sent to
         *               XMLHttpRequest.send (typically a File).
         * @return Resolves to the location of the uploaded file.
         */
      }, {
        key: 'uploadFile',
        value: function() {
          const _uploadFile = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee6(file) {
            let versions; let data
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee6$(_context6) {
              while (1) {
switch (_context6.prev = _context6.next) {
                  case 0:
                    _context6.next = 2
                    return this.getClientVersions()
                  case 2:
                    versions = _context6.sent
                    if (versions.includes(_ApiVersion.UnstableApiVersion.MSC4039)) {
                      _context6.next = 5
                      break
                    }
                    throw new Error('The upload_file action is not supported by the client.')
                  case 5:
                    data = {
                      file,
                    }
                    return _context6.abrupt('return', this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.MSC4039UploadFileAction, data))
                  case 7:
                  case 'end':
                    return _context6.stop()
                }
}
            }, '_callee6$'), _callee6, this)
          }, '_callee6')))
          /**
           *
           */
          function uploadFile(_x12) {
            return _uploadFile.apply(this, arguments)
          }
          __name(uploadFile, 'uploadFile')
          return uploadFile
        }(),
        /**
         * Download a file from the media repository on the homeserver.
         *
         * @param contentUri - MXC URI of the file to download.
         * @return Resolves to the contents of the file.
         */
      }, {
        key: 'downloadFile',
        value: function() {
          const _downloadFile = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee7(contentUri) {
            let versions; let data
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee7$(_context7) {
              while (1) {
switch (_context7.prev = _context7.next) {
                  case 0:
                    _context7.next = 2
                    return this.getClientVersions()
                  case 2:
                    versions = _context7.sent
                    if (versions.includes(_ApiVersion.UnstableApiVersion.MSC4039)) {
                      _context7.next = 5
                      break
                    }
                    throw new Error('The download_file action is not supported by the client.')
                  case 5:
                    data = {
                      content_uri: contentUri,
                    }
                    return _context7.abrupt('return', this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.MSC4039DownloadFileAction, data))
                  case 7:
                  case 'end':
                    return _context7.stop()
                }
}
            }, '_callee7$'), _callee7, this)
          }, '_callee7')))
          /**
           *
           */
          function downloadFile(_x13) {
            return _downloadFile.apply(this, arguments)
          }
          __name(downloadFile, 'downloadFile')
          return downloadFile
        }(),
        /**
         * Starts the communication channel. This should be done early to ensure
         * that messages are not missed. Communication can only be stopped by the client.
         */
      }, {
        key: 'start',
        value: /* @__PURE__ */ __name(function start() {
          const _this6 = this
          this.transport.start()
          this.getClientVersions().then(function(v) {
            if (v.includes(_ApiVersion.UnstableApiVersion.MSC2974)) {
              _this6.supportsMSC2974Renegotiate = true
            }
          })
        }, 'start'),
      }, {
        key: 'handleMessage',
        value: /* @__PURE__ */ __name(function handleMessage(ev) {
          const actionEv = new CustomEvent('action:'.concat(ev.detail.action), {
            detail: ev.detail,
            cancelable: true,
          })
          this.emit('action:'.concat(ev.detail.action), actionEv)
          if (!actionEv.defaultPrevented) {
            switch (ev.detail.action) {
              case _WidgetApiAction.WidgetApiToWidgetAction.SupportedApiVersions:
                return this.replyVersions(ev.detail)
              case _WidgetApiAction.WidgetApiToWidgetAction.Capabilities:
                return this.handleCapabilities(ev.detail)
              case _WidgetApiAction.WidgetApiToWidgetAction.UpdateVisibility:
                return this.transport.reply(ev.detail, {})
              case _WidgetApiAction.WidgetApiToWidgetAction.NotifyCapabilities:
                return this.transport.reply(ev.detail, {})
              default:
                return this.transport.reply(ev.detail, {
                  error: {
                    message: `Unknown or unsupported action: ${ ev.detail.action}`,
                  },
                })
            }
          }
        }, 'handleMessage'),
      }, {
        key: 'replyVersions',
        value: /* @__PURE__ */ __name(function replyVersions(request) {
          this.transport.reply(request, {
            supported_versions: _ApiVersion.CurrentApiVersions,
          })
        }, 'replyVersions'),
      }, {
        key: 'getClientVersions',
        value: /* @__PURE__ */ __name(function getClientVersions() {
          const _this7 = this
          if (Array.isArray(this.cachedClientVersions)) {
            return Promise.resolve(this.cachedClientVersions)
          }
          return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.SupportedApiVersions, {}).then(function(r) {
            _this7.cachedClientVersions = r.supported_versions
            return r.supported_versions
          })['catch'](function(e) {
            console.warn('non-fatal error getting supported client versions: ', e)
            return []
          })
        }, 'getClientVersions'),
      }, {
        key: 'handleCapabilities',
        value: /* @__PURE__ */ __name(function handleCapabilities(request) {
          const _this8 = this
          if (this.capabilitiesFinished) {
            return this.transport.reply(request, {
              error: {
                message: 'Capability negotiation already completed',
              },
            })
          }
          return this.getClientVersions().then(function(v) {
            if (v.includes(_ApiVersion.UnstableApiVersion.MSC2871)) {
              _this8.once('action:'.concat(_WidgetApiAction.WidgetApiToWidgetAction.NotifyCapabilities), function(ev) {
                _this8.approvedCapabilities = ev.detail.data.approved
                _this8.emit('ready')
              })
            } else {
              _this8.emit('ready')
            }
            _this8.capabilitiesFinished = true
            return _this8.transport.reply(request, {
              capabilities: _this8.requestedCapabilities,
            })
          })
        }, 'handleCapabilities'),
      }])
      return WidgetApi2
    }(_events.EventEmitter)
    exports.WidgetApi = WidgetApi
  },
})

// node_modules/matrix-widget-api/lib/interfaces/Capabilities.js
const require_Capabilities = __commonJS({
  'node_modules/matrix-widget-api/lib/interfaces/Capabilities.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.VideoConferenceCapabilities = exports.StickerpickerCapabilities = exports.MatrixCapabilities = void 0
    exports.getTimelineRoomIDFromCapability = getTimelineRoomIDFromCapability
    exports.isTimelineCapability = isTimelineCapability
    exports.isTimelineCapabilityFor = isTimelineCapabilityFor
    const MatrixCapabilities = /* @__PURE__ */ function(MatrixCapabilities2) {
      MatrixCapabilities2['Screenshots'] = 'm.capability.screenshot'
      MatrixCapabilities2['StickerSending'] = 'm.sticker'
      MatrixCapabilities2['AlwaysOnScreen'] = 'm.always_on_screen'
      MatrixCapabilities2['RequiresClient'] = 'io.element.requires_client'
      MatrixCapabilities2['MSC2931Navigate'] = 'org.matrix.msc2931.navigate'
      MatrixCapabilities2['MSC3846TurnServers'] = 'town.robin.msc3846.turn_servers'
      MatrixCapabilities2['MSC3973UserDirectorySearch'] = 'org.matrix.msc3973.user_directory_search'
      MatrixCapabilities2['MSC4039UploadFile'] = 'org.matrix.msc4039.upload_file'
      MatrixCapabilities2['MSC4039DownloadFile'] = 'org.matrix.msc4039.download_file'
      MatrixCapabilities2['MSC4157SendDelayedEvent'] = 'org.matrix.msc4157.send.delayed_event'
      MatrixCapabilities2['MSC4157UpdateDelayedEvent'] = 'org.matrix.msc4157.update_delayed_event'
      return MatrixCapabilities2
    }({})
    exports.MatrixCapabilities = MatrixCapabilities
    const StickerpickerCapabilities = [MatrixCapabilities.StickerSending]
    exports.StickerpickerCapabilities = StickerpickerCapabilities
    const VideoConferenceCapabilities = [MatrixCapabilities.AlwaysOnScreen]
    exports.VideoConferenceCapabilities = VideoConferenceCapabilities
    /**
     *
     */
    function isTimelineCapability(capability) {
      return capability === null || capability === void 0 ? void 0 : capability.startsWith('org.matrix.msc2762.timeline:')
    }
    __name(isTimelineCapability, 'isTimelineCapability')
    /**
     *
     */
    function isTimelineCapabilityFor(capability, roomId) {
      return capability === 'org.matrix.msc2762.timeline:'.concat(roomId)
    }
    __name(isTimelineCapabilityFor, 'isTimelineCapabilityFor')
    /**
     *
     */
    function getTimelineRoomIDFromCapability(capability) {
      return capability.substring(capability.indexOf(':') + 1)
    }
    __name(getTimelineRoomIDFromCapability, 'getTimelineRoomIDFromCapability')
  },
})

// node_modules/matrix-widget-api/lib/util/SimpleObservable.js
const require_SimpleObservable = __commonJS({
  'node_modules/matrix-widget-api/lib/util/SimpleObservable.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.SimpleObservable = void 0
    /**
     *
     */
    function _typeof(obj) {
      '@babel/helpers - typeof'
      return _typeof = typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol' ? function(obj2) {
        return typeof obj2
      } : function(obj2) {
        return obj2 && typeof Symbol === 'function' && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? 'symbol' : typeof obj2
      }, _typeof(obj)
    }
    __name(_typeof, '_typeof')
    /**
     *
     */
    function _createForOfIteratorHelper(o, allowArrayLike) {
      let it = typeof Symbol !== 'undefined' && o[Symbol.iterator] || o['@@iterator']
      if (!it) {
        if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === 'number') {
          if (it) {
o = it
}
          let i = 0
          const F = /* @__PURE__ */ __name(function F2() {
          }, 'F')
          return {s: F, n: /* @__PURE__ */ __name(function n() {
            if (i >= o.length) {
return {done: true}
}
            return {done: false, value: o[i++]}
          }, 'n'), e: /* @__PURE__ */ __name(function e(_e) {
            throw _e
          }, 'e'), f: F}
        }
        throw new TypeError('Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.')
      }
      let normalCompletion = true; let didErr = false; let err
      return {s: /* @__PURE__ */ __name(function s() {
        it = it.call(o)
      }, 's'), n: /* @__PURE__ */ __name(function n() {
        const step = it.next()
        normalCompletion = step.done
        return step
      }, 'n'), e: /* @__PURE__ */ __name(function e(_e2) {
        didErr = true
        err = _e2
      }, 'e'), f: /* @__PURE__ */ __name(function f() {
        try {
          if (!normalCompletion && it['return'] != null) {
it['return']()
}
        } finally {
          if (didErr) {
throw err
}
        }
      }, 'f')}
    }
    __name(_createForOfIteratorHelper, '_createForOfIteratorHelper')
    /**
     *
     */
    function _unsupportedIterableToArray(o, minLen) {
      if (!o) {
return
}
      if (typeof o === 'string') {
return _arrayLikeToArray(o, minLen)
}
      let n = Object.prototype.toString.call(o).slice(8, -1)
      if (n === 'Object' && o.constructor) {
n = o.constructor.name
}
      if (n === 'Map' || n === 'Set') {
return Array.from(o)
}
      if (n === 'Arguments' || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) {
return _arrayLikeToArray(o, minLen)
}
    }
    __name(_unsupportedIterableToArray, '_unsupportedIterableToArray')
    /**
     *
     */
    function _arrayLikeToArray(arr, len) {
      if (len == null || len > arr.length) {
len = arr.length
}
      for (var i = 0, arr2 = new Array(len); i < len; i++) {
arr2[i] = arr[i]
}
      return arr2
    }
    __name(_arrayLikeToArray, '_arrayLikeToArray')
    /**
     *
     */
    function _classCallCheck(instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError('Cannot call a class as a function')
      }
    }
    __name(_classCallCheck, '_classCallCheck')
    /**
     *
     */
    function _defineProperties(target, props) {
      for (let i = 0; i < props.length; i++) {
        const descriptor = props[i]
        descriptor.enumerable = descriptor.enumerable || false
        descriptor.configurable = true
        if ('value' in descriptor) {
descriptor.writable = true
}
        Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor)
      }
    }
    __name(_defineProperties, '_defineProperties')
    /**
     *
     */
    function _createClass(Constructor, protoProps, staticProps) {
      if (protoProps) {
_defineProperties(Constructor.prototype, protoProps)
}
      if (staticProps) {
_defineProperties(Constructor, staticProps)
}
      Object.defineProperty(Constructor, 'prototype', {writable: false})
      return Constructor
    }
    __name(_createClass, '_createClass')
    /**
     *
     */
    function _defineProperty(obj, key, value) {
      key = _toPropertyKey(key)
      if (key in obj) {
        Object.defineProperty(obj, key, {value, enumerable: true, configurable: true, writable: true})
      } else {
        obj[key] = value
      }
      return obj
    }
    __name(_defineProperty, '_defineProperty')
    /**
     *
     */
    function _toPropertyKey(arg) {
      const key = _toPrimitive(arg, 'string')
      return _typeof(key) === 'symbol' ? key : String(key)
    }
    __name(_toPropertyKey, '_toPropertyKey')
    /**
     *
     */
    function _toPrimitive(input, hint) {
      if (_typeof(input) !== 'object' || input === null) {
return input
}
      const prim = input[Symbol.toPrimitive]
      if (prim !== void 0) {
        const res = prim.call(input, hint || 'default')
        if (_typeof(res) !== 'object') {
return res
}
        throw new TypeError('@@toPrimitive must return a primitive value.')
      }
      return (hint === 'string' ? String : Number)(input)
    }
    __name(_toPrimitive, '_toPrimitive')
    const SimpleObservable = /* @__PURE__ */ function() {
      /**
       *
       */
      function SimpleObservable2(initialFn) {
        _classCallCheck(this, SimpleObservable2)
        _defineProperty(this, 'listeners', [])
        if (initialFn) {
this.listeners.push(initialFn)
}
      }
      __name(SimpleObservable2, 'SimpleObservable')
      _createClass(SimpleObservable2, [{
        key: 'onUpdate',
        value: /* @__PURE__ */ __name(function onUpdate(fn) {
          this.listeners.push(fn)
        }, 'onUpdate'),
      }, {
        key: 'update',
        value: /* @__PURE__ */ __name(function update(val) {
          const _iterator = _createForOfIteratorHelper(this.listeners); let _step
          try {
            for (_iterator.s(); !(_step = _iterator.n()).done; ) {
              const listener = _step.value
              listener(val)
            }
          } catch (err) {
            _iterator.e(err)
          } finally {
            _iterator.f()
          }
        }, 'update'),
      }, {
        key: 'close',
        value: /* @__PURE__ */ __name(function close() {
          this.listeners = []
        }, 'close'),
      }])
      return SimpleObservable2
    }()
    exports.SimpleObservable = SimpleObservable
  },
})

// node_modules/matrix-widget-api/lib/interfaces/UpdateDelayedEventAction.js
const require_UpdateDelayedEventAction = __commonJS({
  'node_modules/matrix-widget-api/lib/interfaces/UpdateDelayedEventAction.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.UpdateDelayedEventAction = void 0
    const UpdateDelayedEventAction = /* @__PURE__ */ function(UpdateDelayedEventAction2) {
      UpdateDelayedEventAction2['Cancel'] = 'cancel'
      UpdateDelayedEventAction2['Restart'] = 'restart'
      UpdateDelayedEventAction2['Send'] = 'send'
      return UpdateDelayedEventAction2
    }({})
    exports.UpdateDelayedEventAction = UpdateDelayedEventAction
  },
})

// node_modules/matrix-widget-api/lib/ClientWidgetApi.js
const require_ClientWidgetApi = __commonJS({
  'node_modules/matrix-widget-api/lib/ClientWidgetApi.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.ClientWidgetApi = void 0
    const _events = require_events()
    const _PostmessageTransport = require_PostmessageTransport()
    const _WidgetApiDirection = require_WidgetApiDirection()
    const _WidgetApiAction = require_WidgetApiAction()
    const _Capabilities = require_Capabilities()
    const _ApiVersion = require_ApiVersion()
    const _WidgetEventCapability = require_WidgetEventCapability()
    const _GetOpenIDAction = require_GetOpenIDAction()
    const _SimpleObservable = require_SimpleObservable()
    const _Symbols = require_Symbols()
    const _UpdateDelayedEventAction = require_UpdateDelayedEventAction()
    /**
     *
     */
    function _typeof(obj) {
      '@babel/helpers - typeof'
      return _typeof = typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol' ? function(obj2) {
        return typeof obj2
      } : function(obj2) {
        return obj2 && typeof Symbol === 'function' && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? 'symbol' : typeof obj2
      }, _typeof(obj)
    }
    __name(_typeof, '_typeof')
    /**
     *
     */
    function ownKeys(object, enumerableOnly) {
      const keys = Object.keys(object)
      if (Object.getOwnPropertySymbols) {
        let symbols = Object.getOwnPropertySymbols(object)
        enumerableOnly && (symbols = symbols.filter(function(sym) {
          return Object.getOwnPropertyDescriptor(object, sym).enumerable
        })), keys.push.apply(keys, symbols)
      }
      return keys
    }
    __name(ownKeys, 'ownKeys')
    /**
     *
     */
    function _objectSpread(target) {
      for (let i = 1; i < arguments.length; i++) {
        var source = arguments[i] != null ? arguments[i] : {}
        i % 2 ? ownKeys(Object(source), true).forEach(function(key) {
          _defineProperty(target, key, source[key])
        }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function(key) {
          Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key))
        })
      }
      return target
    }
    __name(_objectSpread, '_objectSpread')
    /**
     *
     */
    function _createForOfIteratorHelper(o, allowArrayLike) {
      let it = typeof Symbol !== 'undefined' && o[Symbol.iterator] || o['@@iterator']
      if (!it) {
        if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === 'number') {
          if (it) {
o = it
}
          let i = 0
          const F = /* @__PURE__ */ __name(function F2() {
          }, 'F')
          return {s: F, n: /* @__PURE__ */ __name(function n() {
            if (i >= o.length) {
return {done: true}
}
            return {done: false, value: o[i++]}
          }, 'n'), e: /* @__PURE__ */ __name(function e(_e) {
            throw _e
          }, 'e'), f: F}
        }
        throw new TypeError('Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.')
      }
      let normalCompletion = true; let didErr = false; let err
      return {s: /* @__PURE__ */ __name(function s() {
        it = it.call(o)
      }, 's'), n: /* @__PURE__ */ __name(function n() {
        const step = it.next()
        normalCompletion = step.done
        return step
      }, 'n'), e: /* @__PURE__ */ __name(function e(_e2) {
        didErr = true
        err = _e2
      }, 'e'), f: /* @__PURE__ */ __name(function f() {
        try {
          if (!normalCompletion && it['return'] != null) {
it['return']()
}
        } finally {
          if (didErr) {
throw err
}
        }
      }, 'f')}
    }
    __name(_createForOfIteratorHelper, '_createForOfIteratorHelper')
    /**
     *
     */
    function _toConsumableArray(arr) {
      return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableSpread()
    }
    __name(_toConsumableArray, '_toConsumableArray')
    /**
     *
     */
    function _nonIterableSpread() {
      throw new TypeError('Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.')
    }
    __name(_nonIterableSpread, '_nonIterableSpread')
    /**
     *
     */
    function _unsupportedIterableToArray(o, minLen) {
      if (!o) {
return
}
      if (typeof o === 'string') {
return _arrayLikeToArray(o, minLen)
}
      let n = Object.prototype.toString.call(o).slice(8, -1)
      if (n === 'Object' && o.constructor) {
n = o.constructor.name
}
      if (n === 'Map' || n === 'Set') {
return Array.from(o)
}
      if (n === 'Arguments' || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) {
return _arrayLikeToArray(o, minLen)
}
    }
    __name(_unsupportedIterableToArray, '_unsupportedIterableToArray')
    /**
     *
     */
    function _iterableToArray(iter) {
      if (typeof Symbol !== 'undefined' && iter[Symbol.iterator] != null || iter['@@iterator'] != null) {
return Array.from(iter)
}
    }
    __name(_iterableToArray, '_iterableToArray')
    /**
     *
     */
    function _arrayWithoutHoles(arr) {
      if (Array.isArray(arr)) {
return _arrayLikeToArray(arr)
}
    }
    __name(_arrayWithoutHoles, '_arrayWithoutHoles')
    /**
     *
     */
    function _arrayLikeToArray(arr, len) {
      if (len == null || len > arr.length) {
len = arr.length
}
      for (var i = 0, arr2 = new Array(len); i < len; i++) {
arr2[i] = arr[i]
}
      return arr2
    }
    __name(_arrayLikeToArray, '_arrayLikeToArray')
    /**
     *
     */
    function _regeneratorRuntime() {
      'use strict'
      _regeneratorRuntime = /* @__PURE__ */ __name(function _regeneratorRuntime2() {
        return exports2
      }, '_regeneratorRuntime')
      var exports2 = {}; const Op = Object.prototype; const hasOwn = Op.hasOwnProperty; const defineProperty = Object.defineProperty || function(obj, key, desc) {
        obj[key] = desc.value
      }; const $Symbol = typeof Symbol === 'function' ? Symbol : {}; const iteratorSymbol = $Symbol.iterator || '@@iterator'; const asyncIteratorSymbol = $Symbol.asyncIterator || '@@asyncIterator'; const toStringTagSymbol = $Symbol.toStringTag || '@@toStringTag'
      /**
       *
       */
      function define(obj, key, value) {
        return Object.defineProperty(obj, key, {value, enumerable: true, configurable: true, writable: true}), obj[key]
      }
      __name(define, 'define')
      try {
        define({}, '')
      } catch (err) {
        define = /* @__PURE__ */ __name(function define2(obj, key, value) {
          return obj[key] = value
        }, 'define')
      }
      /**
       *
       */
      function wrap(innerFn, outerFn, self, tryLocsList) {
        const protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator; const generator = Object.create(protoGenerator.prototype); const context = new Context(tryLocsList || [])
        return defineProperty(generator, '_invoke', {value: makeInvokeMethod(innerFn, self, context)}), generator
      }
      __name(wrap, 'wrap')
      /**
       *
       */
      function tryCatch(fn, obj, arg) {
        try {
          return {type: 'normal', arg: fn.call(obj, arg)}
        } catch (err) {
          return {type: 'throw', arg: err}
        }
      }
      __name(tryCatch, 'tryCatch')
      exports2.wrap = wrap
      const ContinueSentinel = {}
      /**
       *
       */
      function Generator() {
      }
      __name(Generator, 'Generator')
      /**
       *
       */
      function GeneratorFunction() {
      }
      __name(GeneratorFunction, 'GeneratorFunction')
      /**
       *
       */
      function GeneratorFunctionPrototype() {
      }
      __name(GeneratorFunctionPrototype, 'GeneratorFunctionPrototype')
      let IteratorPrototype = {}
      define(IteratorPrototype, iteratorSymbol, function() {
        return this
      })
      const getProto = Object.getPrototypeOf; const NativeIteratorPrototype = getProto && getProto(getProto(values([])))
      NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol) && (IteratorPrototype = NativeIteratorPrototype)
      const Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype)
      /**
       *
       */
      function defineIteratorMethods(prototype) {
        ['next', 'throw', 'return'].forEach(function(method) {
          define(prototype, method, function(arg) {
            return this._invoke(method, arg)
          })
        })
      }
      __name(defineIteratorMethods, 'defineIteratorMethods')
      /**
       *
       */
      function AsyncIterator(generator, PromiseImpl) {
        /**
         *
         */
        function invoke(method, arg, resolve, reject) {
          const record = tryCatch(generator[method], generator, arg)
          if (record.type !== 'throw') {
            const result = record.arg; const value = result.value
            return value && _typeof(value) == 'object' && hasOwn.call(value, '__await') ? PromiseImpl.resolve(value.__await).then(function(value2) {
              invoke('next', value2, resolve, reject)
            }, function(err) {
              invoke('throw', err, resolve, reject)
            }) : PromiseImpl.resolve(value).then(function(unwrapped) {
              result.value = unwrapped, resolve(result)
            }, function(error) {
              return invoke('throw', error, resolve, reject)
            })
          }
          reject(record.arg)
        }
        __name(invoke, 'invoke')
        let previousPromise
        defineProperty(this, '_invoke', {value: /* @__PURE__ */ __name(function value(method, arg) {
          /**
           *
           */
          function callInvokeWithMethodAndArg() {
            return new PromiseImpl(function(resolve, reject) {
              invoke(method, arg, resolve, reject)
            })
          }
          __name(callInvokeWithMethodAndArg, 'callInvokeWithMethodAndArg')
          return previousPromise = previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg()
        }, 'value')})
      }
      __name(AsyncIterator, 'AsyncIterator')
      /**
       *
       */
      function makeInvokeMethod(innerFn, self, context) {
        let state = 'suspendedStart'
        return function(method, arg) {
          if (state === 'executing') {
throw new Error('Generator is already running')
}
          if (state === 'completed') {
            if (method === 'throw') {
throw arg
}
            return doneResult()
          }
          for (context.method = method, context.arg = arg; ; ) {
            const delegate = context.delegate
            if (delegate) {
              const delegateResult = maybeInvokeDelegate(delegate, context)
              if (delegateResult) {
                if (delegateResult === ContinueSentinel) {
continue
}
                return delegateResult
              }
            }
            if (context.method === 'next') {
context.sent = context._sent = context.arg
} else if (context.method === 'throw') {
              if (state === 'suspendedStart') {
throw state = 'completed', context.arg
}
              context.dispatchException(context.arg)
            } else {
context.method === 'return' && context.abrupt('return', context.arg)
}
            state = 'executing'
            const record = tryCatch(innerFn, self, context)
            if (record.type === 'normal') {
              if (state = context.done ? 'completed' : 'suspendedYield', record.arg === ContinueSentinel) {
continue
}
              return {value: record.arg, done: context.done}
            }
            record.type === 'throw' && (state = 'completed', context.method = 'throw', context.arg = record.arg)
          }
        }
      }
      __name(makeInvokeMethod, 'makeInvokeMethod')
      /**
       *
       */
      function maybeInvokeDelegate(delegate, context) {
        const methodName = context.method; const method = delegate.iterator[methodName]
        if (void 0 === method) {
return context.delegate = null, methodName === 'throw' && delegate.iterator['return'] && (context.method = 'return', context.arg = void 0, maybeInvokeDelegate(delegate, context), context.method === 'throw') || methodName !== 'return' && (context.method = 'throw', context.arg = new TypeError(`The iterator does not provide a '${ methodName }' method`)), ContinueSentinel
}
        const record = tryCatch(method, delegate.iterator, context.arg)
        if (record.type === 'throw') {
return context.method = 'throw', context.arg = record.arg, context.delegate = null, ContinueSentinel
}
        const info = record.arg
        return info ? info.done ? (context[delegate.resultName] = info.value, context.next = delegate.nextLoc, context.method !== 'return' && (context.method = 'next', context.arg = void 0), context.delegate = null, ContinueSentinel) : info : (context.method = 'throw', context.arg = new TypeError('iterator result is not an object'), context.delegate = null, ContinueSentinel)
      }
      __name(maybeInvokeDelegate, 'maybeInvokeDelegate')
      /**
       *
       */
      function pushTryEntry(locs) {
        const entry = {tryLoc: locs[0]}
        1 in locs && (entry.catchLoc = locs[1]), 2 in locs && (entry.finallyLoc = locs[2], entry.afterLoc = locs[3]), this.tryEntries.push(entry)
      }
      __name(pushTryEntry, 'pushTryEntry')
      /**
       *
       */
      function resetTryEntry(entry) {
        const record = entry.completion || {}
        record.type = 'normal', delete record.arg, entry.completion = record
      }
      __name(resetTryEntry, 'resetTryEntry')
      /**
       *
       */
      function Context(tryLocsList) {
        this.tryEntries = [{tryLoc: 'root'}], tryLocsList.forEach(pushTryEntry, this), this.reset(true)
      }
      __name(Context, 'Context')
      /**
       *
       */
      function values(iterable) {
        if (iterable) {
          const iteratorMethod = iterable[iteratorSymbol]
          if (iteratorMethod) {
return iteratorMethod.call(iterable)
}
          if (typeof iterable.next === 'function') {
return iterable
}
          if (!isNaN(iterable.length)) {
            let i = -1; const next = /* @__PURE__ */ __name(function next2() {
              for (; ++i < iterable.length; ) {
if (hasOwn.call(iterable, i)) {
return next2.value = iterable[i], next2.done = false, next2
}
}
              return next2.value = void 0, next2.done = true, next2
            }, 'next')
            return next.next = next
          }
        }
        return {next: doneResult}
      }
      __name(values, 'values')
      /**
       *
       */
      function doneResult() {
        return {value: void 0, done: true}
      }
      __name(doneResult, 'doneResult')
      return GeneratorFunction.prototype = GeneratorFunctionPrototype, defineProperty(Gp, 'constructor', {value: GeneratorFunctionPrototype, configurable: true}), defineProperty(GeneratorFunctionPrototype, 'constructor', {value: GeneratorFunction, configurable: true}), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, 'GeneratorFunction'), exports2.isGeneratorFunction = function(genFun) {
        const ctor = typeof genFun === 'function' && genFun.constructor
        return !!ctor && (ctor === GeneratorFunction || (ctor.displayName || ctor.name) === 'GeneratorFunction')
      }, exports2.mark = function(genFun) {
        return Object.setPrototypeOf ? Object.setPrototypeOf(genFun, GeneratorFunctionPrototype) : (genFun.__proto__ = GeneratorFunctionPrototype, define(genFun, toStringTagSymbol, 'GeneratorFunction')), genFun.prototype = Object.create(Gp), genFun
      }, exports2.awrap = function(arg) {
        return {__await: arg}
      }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, asyncIteratorSymbol, function() {
        return this
      }), exports2.AsyncIterator = AsyncIterator, exports2.async = function(innerFn, outerFn, self, tryLocsList, PromiseImpl) {
        void 0 === PromiseImpl && (PromiseImpl = Promise)
        const iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl)
        return exports2.isGeneratorFunction(outerFn) ? iter : iter.next().then(function(result) {
          return result.done ? result.value : iter.next()
        })
      }, defineIteratorMethods(Gp), define(Gp, toStringTagSymbol, 'Generator'), define(Gp, iteratorSymbol, function() {
        return this
      }), define(Gp, 'toString', function() {
        return '[object Generator]'
      }), exports2.keys = function(val) {
        const object = Object(val); const keys = []
        for (const key in object) {
keys.push(key)
}
        return keys.reverse(), /* @__PURE__ */ __name(function next() {
          for (; keys.length; ) {
            const key2 = keys.pop()
            if (key2 in object) {
return next.value = key2, next.done = false, next
}
          }
          return next.done = true, next
        }, 'next')
      }, exports2.values = values, Context.prototype = {constructor: Context, reset: /* @__PURE__ */ __name(function reset(skipTempReset) {
        if (this.prev = 0, this.next = 0, this.sent = this._sent = void 0, this.done = false, this.delegate = null, this.method = 'next', this.arg = void 0, this.tryEntries.forEach(resetTryEntry), !skipTempReset) {
for (const name in this) {
name.charAt(0) === 't' && hasOwn.call(this, name) && !isNaN(+name.slice(1)) && (this[name] = void 0)
}
}
      }, 'reset'), stop: /* @__PURE__ */ __name(function stop() {
        this.done = true
        const rootRecord = this.tryEntries[0].completion
        if (rootRecord.type === 'throw') {
throw rootRecord.arg
}
        return this.rval
      }, 'stop'), dispatchException: /* @__PURE__ */ __name(function dispatchException(exception) {
        if (this.done) {
throw exception
}
        const context = this
        /**
         *
         */
        function handle(loc, caught) {
          return record.type = 'throw', record.arg = exception, context.next = loc, caught && (context.method = 'next', context.arg = void 0), !!caught
        }
        __name(handle, 'handle')
        for (let i = this.tryEntries.length - 1; i >= 0; --i) {
          const entry = this.tryEntries[i]; var record = entry.completion
          if (entry.tryLoc === 'root') {
return handle('end')
}
          if (entry.tryLoc <= this.prev) {
            const hasCatch = hasOwn.call(entry, 'catchLoc'); const hasFinally = hasOwn.call(entry, 'finallyLoc')
            if (hasCatch && hasFinally) {
              if (this.prev < entry.catchLoc) {
return handle(entry.catchLoc, true)
}
              if (this.prev < entry.finallyLoc) {
return handle(entry.finallyLoc)
}
            } else if (hasCatch) {
              if (this.prev < entry.catchLoc) {
return handle(entry.catchLoc, true)
}
            } else {
              if (!hasFinally) {
throw new Error('try statement without catch or finally')
}
              if (this.prev < entry.finallyLoc) {
return handle(entry.finallyLoc)
}
            }
          }
        }
      }, 'dispatchException'), abrupt: /* @__PURE__ */ __name(function abrupt(type, arg) {
        for (let i = this.tryEntries.length - 1; i >= 0; --i) {
          const entry = this.tryEntries[i]
          if (entry.tryLoc <= this.prev && hasOwn.call(entry, 'finallyLoc') && this.prev < entry.finallyLoc) {
            var finallyEntry = entry
            break
          }
        }
        finallyEntry && (type === 'break' || type === 'continue') && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc && (finallyEntry = null)
        const record = finallyEntry ? finallyEntry.completion : {}
        return record.type = type, record.arg = arg, finallyEntry ? (this.method = 'next', this.next = finallyEntry.finallyLoc, ContinueSentinel) : this.complete(record)
      }, 'abrupt'), complete: /* @__PURE__ */ __name(function complete(record, afterLoc) {
        if (record.type === 'throw') {
throw record.arg
}
        return record.type === 'break' || record.type === 'continue' ? this.next = record.arg : record.type === 'return' ? (this.rval = this.arg = record.arg, this.method = 'return', this.next = 'end') : record.type === 'normal' && afterLoc && (this.next = afterLoc), ContinueSentinel
      }, 'complete'), finish: /* @__PURE__ */ __name(function finish(finallyLoc) {
        for (let i = this.tryEntries.length - 1; i >= 0; --i) {
          const entry = this.tryEntries[i]
          if (entry.finallyLoc === finallyLoc) {
return this.complete(entry.completion, entry.afterLoc), resetTryEntry(entry), ContinueSentinel
}
        }
      }, 'finish'), catch: /* @__PURE__ */ __name(function _catch(tryLoc) {
        for (let i = this.tryEntries.length - 1; i >= 0; --i) {
          const entry = this.tryEntries[i]
          if (entry.tryLoc === tryLoc) {
            const record = entry.completion
            if (record.type === 'throw') {
              var thrown = record.arg
              resetTryEntry(entry)
            }
            return thrown
          }
        }
        throw new Error('illegal catch attempt')
      }, '_catch'), delegateYield: /* @__PURE__ */ __name(function delegateYield(iterable, resultName, nextLoc) {
        return this.delegate = {iterator: values(iterable), resultName, nextLoc}, this.method === 'next' && (this.arg = void 0), ContinueSentinel
      }, 'delegateYield')}, exports2
    }
    __name(_regeneratorRuntime, '_regeneratorRuntime')
    /**
     *
     */
    function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
      try {
        var info = gen[key](arg)
        var value = info.value
      } catch (error) {
        reject(error)
        return
      }
      if (info.done) {
        resolve(value)
      } else {
        Promise.resolve(value).then(_next, _throw)
      }
    }
    __name(asyncGeneratorStep, 'asyncGeneratorStep')
    /**
     *
     */
    function _asyncToGenerator(fn) {
      return function() {
        const self = this; const args = arguments
        return new Promise(function(resolve, reject) {
          const gen = fn.apply(self, args)
          /**
           *
           */
          function _next(value) {
            asyncGeneratorStep(gen, resolve, reject, _next, _throw, 'next', value)
          }
          __name(_next, '_next')
          /**
           *
           */
          function _throw(err) {
            asyncGeneratorStep(gen, resolve, reject, _next, _throw, 'throw', err)
          }
          __name(_throw, '_throw')
          _next(void 0)
        })
      }
    }
    __name(_asyncToGenerator, '_asyncToGenerator')
    /**
     *
     */
    function _classCallCheck(instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError('Cannot call a class as a function')
      }
    }
    __name(_classCallCheck, '_classCallCheck')
    /**
     *
     */
    function _defineProperties(target, props) {
      for (let i = 0; i < props.length; i++) {
        const descriptor = props[i]
        descriptor.enumerable = descriptor.enumerable || false
        descriptor.configurable = true
        if ('value' in descriptor) {
descriptor.writable = true
}
        Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor)
      }
    }
    __name(_defineProperties, '_defineProperties')
    /**
     *
     */
    function _createClass(Constructor, protoProps, staticProps) {
      if (protoProps) {
_defineProperties(Constructor.prototype, protoProps)
}
      if (staticProps) {
_defineProperties(Constructor, staticProps)
}
      Object.defineProperty(Constructor, 'prototype', {writable: false})
      return Constructor
    }
    __name(_createClass, '_createClass')
    /**
     *
     */
    function _inherits(subClass, superClass) {
      if (typeof superClass !== 'function' && superClass !== null) {
        throw new TypeError('Super expression must either be null or a function')
      }
      subClass.prototype = Object.create(superClass && superClass.prototype, {constructor: {value: subClass, writable: true, configurable: true}})
      Object.defineProperty(subClass, 'prototype', {writable: false})
      if (superClass) {
_setPrototypeOf(subClass, superClass)
}
    }
    __name(_inherits, '_inherits')
    /**
     *
     */
    function _setPrototypeOf(o, p) {
      _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : /* @__PURE__ */ __name(function _setPrototypeOf2(o2, p2) {
        o2.__proto__ = p2
        return o2
      }, '_setPrototypeOf')
      return _setPrototypeOf(o, p)
    }
    __name(_setPrototypeOf, '_setPrototypeOf')
    /**
     *
     */
    function _createSuper(Derived) {
      const hasNativeReflectConstruct = _isNativeReflectConstruct()
      return /* @__PURE__ */ __name(function _createSuperInternal() {
        const Super = _getPrototypeOf(Derived); let result
        if (hasNativeReflectConstruct) {
          const NewTarget = _getPrototypeOf(this).constructor
          result = Reflect.construct(Super, arguments, NewTarget)
        } else {
          result = Super.apply(this, arguments)
        }
        return _possibleConstructorReturn(this, result)
      }, '_createSuperInternal')
    }
    __name(_createSuper, '_createSuper')
    /**
     *
     */
    function _possibleConstructorReturn(self, call) {
      if (call && (_typeof(call) === 'object' || typeof call === 'function')) {
        return call
      } else if (call !== void 0) {
        throw new TypeError('Derived constructors may only return object or undefined')
      }
      return _assertThisInitialized(self)
    }
    __name(_possibleConstructorReturn, '_possibleConstructorReturn')
    /**
     *
     */
    function _assertThisInitialized(self) {
      if (self === void 0) {
        throw new ReferenceError('this hasn\'t been initialised - super() hasn\'t been called')
      }
      return self
    }
    __name(_assertThisInitialized, '_assertThisInitialized')
    /**
     *
     */
    function _isNativeReflectConstruct() {
      if (typeof Reflect === 'undefined' || !Reflect.construct) {
return false
}
      if (Reflect.construct.sham) {
return false
}
      if (typeof Proxy === 'function') {
return true
}
      try {
        Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
        }))
        return true
      } catch (e) {
        return false
      }
    }
    __name(_isNativeReflectConstruct, '_isNativeReflectConstruct')
    /**
     *
     */
    function _getPrototypeOf(o) {
      _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : /* @__PURE__ */ __name(function _getPrototypeOf2(o2) {
        return o2.__proto__ || Object.getPrototypeOf(o2)
      }, '_getPrototypeOf')
      return _getPrototypeOf(o)
    }
    __name(_getPrototypeOf, '_getPrototypeOf')
    /**
     *
     */
    function _defineProperty(obj, key, value) {
      key = _toPropertyKey(key)
      if (key in obj) {
        Object.defineProperty(obj, key, {value, enumerable: true, configurable: true, writable: true})
      } else {
        obj[key] = value
      }
      return obj
    }
    __name(_defineProperty, '_defineProperty')
    /**
     *
     */
    function _toPropertyKey(arg) {
      const key = _toPrimitive(arg, 'string')
      return _typeof(key) === 'symbol' ? key : String(key)
    }
    __name(_toPropertyKey, '_toPropertyKey')
    /**
     *
     */
    function _toPrimitive(input, hint) {
      if (_typeof(input) !== 'object' || input === null) {
return input
}
      const prim = input[Symbol.toPrimitive]
      if (prim !== void 0) {
        const res = prim.call(input, hint || 'default')
        if (_typeof(res) !== 'object') {
return res
}
        throw new TypeError('@@toPrimitive must return a primitive value.')
      }
      return (hint === 'string' ? String : Number)(input)
    }
    __name(_toPrimitive, '_toPrimitive')
    /**
     *
     */
    function _asyncIterator(iterable) {
      let method; let async; let sync; let retry = 2
      for (typeof Symbol !== 'undefined' && (async = Symbol.asyncIterator, sync = Symbol.iterator); retry--; ) {
        if (async && (method = iterable[async]) != null) {
return method.call(iterable)
}
        if (sync && (method = iterable[sync]) != null) {
return new AsyncFromSyncIterator(method.call(iterable))
}
        async = '@@asyncIterator', sync = '@@iterator'
      }
      throw new TypeError('Object is not async iterable')
    }
    __name(_asyncIterator, '_asyncIterator')
    /**
     *
     */
    function AsyncFromSyncIterator(s) {
      /**
       *
       */
      function AsyncFromSyncIteratorContinuation(r) {
        if (Object(r) !== r) {
return Promise.reject(new TypeError(`${r } is not an object.`))
}
        const done = r.done
        return Promise.resolve(r.value).then(function(value) {
          return {value, done}
        })
      }
      __name(AsyncFromSyncIteratorContinuation, 'AsyncFromSyncIteratorContinuation')
      return AsyncFromSyncIterator = /* @__PURE__ */ __name(function AsyncFromSyncIterator2(s2) {
        this.s = s2, this.n = s2.next
      }, 'AsyncFromSyncIterator'), AsyncFromSyncIterator.prototype = {s: null, n: null, next: /* @__PURE__ */ __name(function next() {
        return AsyncFromSyncIteratorContinuation(this.n.apply(this.s, arguments))
      }, 'next'), return: /* @__PURE__ */ __name(function _return(value) {
        const ret = this.s['return']
        return void 0 === ret ? Promise.resolve({value, done: true}) : AsyncFromSyncIteratorContinuation(ret.apply(this.s, arguments))
      }, '_return'), throw: /* @__PURE__ */ __name(function _throw(value) {
        const thr = this.s['return']
        return void 0 === thr ? Promise.reject(value) : AsyncFromSyncIteratorContinuation(thr.apply(this.s, arguments))
      }, '_throw')}, new AsyncFromSyncIterator(s)
    }
    __name(AsyncFromSyncIterator, 'AsyncFromSyncIterator')
    const ClientWidgetApi2 = /* @__PURE__ */ function(_EventEmitter) {
      _inherits(ClientWidgetApi3, _EventEmitter)
      const _super = _createSuper(ClientWidgetApi3)
      /**
       *
       */
      function ClientWidgetApi3(widget, iframe, driver) {
        let _this
        _classCallCheck(this, ClientWidgetApi3)
        _this = _super.call(this)
        _this.widget = widget
        _this.iframe = iframe
        _this.driver = driver
        _defineProperty(_assertThisInitialized(_this), 'transport', void 0)
        _defineProperty(_assertThisInitialized(_this), 'cachedWidgetVersions', null)
        _defineProperty(_assertThisInitialized(_this), 'contentLoadedActionSent', false)
        _defineProperty(_assertThisInitialized(_this), 'allowedCapabilities', /* @__PURE__ */ new Set())
        _defineProperty(_assertThisInitialized(_this), 'allowedEvents', [])
        _defineProperty(_assertThisInitialized(_this), 'isStopped', false)
        _defineProperty(_assertThisInitialized(_this), 'turnServers', null)
        _defineProperty(_assertThisInitialized(_this), 'contentLoadedWaitTimer', void 0)
        _defineProperty(_assertThisInitialized(_this), 'pushRoomStateTasks', /* @__PURE__ */ new Set())
        _defineProperty(_assertThisInitialized(_this), 'pushRoomStateResult', /* @__PURE__ */ new Map())
        _defineProperty(_assertThisInitialized(_this), 'flushRoomStateTask', null)
        _defineProperty(_assertThisInitialized(_this), 'viewedRoomId', null)
        if (!(iframe !== null && iframe !== void 0 && iframe.contentWindow)) {
          throw new Error('No iframe supplied')
        }
        if (!widget) {
          throw new Error('Invalid widget')
        }
        if (!driver) {
          throw new Error('Invalid driver')
        }
        _this.transport = new _PostmessageTransport.PostmessageTransport(_WidgetApiDirection.WidgetApiDirection.ToWidget, widget.id, iframe.contentWindow, window)
        _this.transport.targetOrigin = widget.origin
        _this.transport.on('message', _this.handleMessage.bind(_assertThisInitialized(_this)))
        iframe.addEventListener('load', _this.onIframeLoad.bind(_assertThisInitialized(_this)))
        _this.transport.start()
        return _this
      }
      __name(ClientWidgetApi3, 'ClientWidgetApi')
      _createClass(ClientWidgetApi3, [{
        key: 'hasCapability',
        value: /* @__PURE__ */ __name(function hasCapability(capability) {
          return this.allowedCapabilities.has(capability)
        }, 'hasCapability'),
      }, {
        key: 'canUseRoomTimeline',
        value: /* @__PURE__ */ __name(function canUseRoomTimeline(roomId) {
          return this.hasCapability('org.matrix.msc2762.timeline:'.concat(_Symbols.Symbols.AnyRoom)) || this.hasCapability('org.matrix.msc2762.timeline:'.concat(roomId))
        }, 'canUseRoomTimeline'),
      }, {
        key: 'canSendRoomEvent',
        value: /* @__PURE__ */ __name(function canSendRoomEvent(eventType) {
          const msgtype = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : null
          return this.allowedEvents.some(function(e) {
            return e.matchesAsRoomEvent(_WidgetEventCapability.EventDirection.Send, eventType, msgtype)
          })
        }, 'canSendRoomEvent'),
      }, {
        key: 'canSendStateEvent',
        value: /* @__PURE__ */ __name(function canSendStateEvent(eventType, stateKey) {
          return this.allowedEvents.some(function(e) {
            return e.matchesAsStateEvent(_WidgetEventCapability.EventDirection.Send, eventType, stateKey)
          })
        }, 'canSendStateEvent'),
      }, {
        key: 'canSendToDeviceEvent',
        value: /* @__PURE__ */ __name(function canSendToDeviceEvent(eventType) {
          return this.allowedEvents.some(function(e) {
            return e.matchesAsToDeviceEvent(_WidgetEventCapability.EventDirection.Send, eventType)
          })
        }, 'canSendToDeviceEvent'),
      }, {
        key: 'canReceiveRoomEvent',
        value: /* @__PURE__ */ __name(function canReceiveRoomEvent(eventType) {
          const msgtype = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : null
          return this.allowedEvents.some(function(e) {
            return e.matchesAsRoomEvent(_WidgetEventCapability.EventDirection.Receive, eventType, msgtype)
          })
        }, 'canReceiveRoomEvent'),
      }, {
        key: 'canReceiveStateEvent',
        value: /* @__PURE__ */ __name(function canReceiveStateEvent(eventType, stateKey) {
          return this.allowedEvents.some(function(e) {
            return e.matchesAsStateEvent(_WidgetEventCapability.EventDirection.Receive, eventType, stateKey)
          })
        }, 'canReceiveStateEvent'),
      }, {
        key: 'canReceiveToDeviceEvent',
        value: /* @__PURE__ */ __name(function canReceiveToDeviceEvent(eventType) {
          return this.allowedEvents.some(function(e) {
            return e.matchesAsToDeviceEvent(_WidgetEventCapability.EventDirection.Receive, eventType)
          })
        }, 'canReceiveToDeviceEvent'),
      }, {
        key: 'canReceiveRoomAccountData',
        value: /* @__PURE__ */ __name(function canReceiveRoomAccountData(eventType) {
          return this.allowedEvents.some(function(e) {
            return e.matchesAsRoomAccountData(_WidgetEventCapability.EventDirection.Receive, eventType)
          })
        }, 'canReceiveRoomAccountData'),
      }, {
        key: 'stop',
        value: /* @__PURE__ */ __name(function stop() {
          this.isStopped = true
          this.transport.stop()
        }, 'stop'),
      }, {
        key: 'getWidgetVersions',
        value: function() {
          const _getWidgetVersions = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee() {
            let r
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee$(_context) {
              while (1) {
switch (_context.prev = _context.next) {
                  case 0:
                    if (!Array.isArray(this.cachedWidgetVersions)) {
                      _context.next = 2
                      break
                    }
                    return _context.abrupt('return', Promise.resolve(this.cachedWidgetVersions))
                  case 2:
                    _context.prev = 2
                    _context.next = 5
                    return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.SupportedApiVersions, {})
                  case 5:
                    r = _context.sent
                    this.cachedWidgetVersions = r.supported_versions
                    return _context.abrupt('return', r.supported_versions)
                  case 10:
                    _context.prev = 10
                    _context.t0 = _context['catch'](2)
                    console.warn('non-fatal error getting supported widget versions: ', _context.t0)
                    return _context.abrupt('return', [])
                  case 14:
                  case 'end':
                    return _context.stop()
                }
}
            }, '_callee$'), _callee, this, [[2, 10]])
          }, '_callee')))
          /**
           *
           */
          function getWidgetVersions() {
            return _getWidgetVersions.apply(this, arguments)
          }
          __name(getWidgetVersions, 'getWidgetVersions')
          return getWidgetVersions
        }(),
      }, {
        key: 'beginCapabilities',
        value: /* @__PURE__ */ __name(function beginCapabilities() {
          const _this2 = this
          this.emit('preparing')
          let requestedCaps
          this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.Capabilities, {}).then(function(caps) {
            requestedCaps = caps.capabilities
            return _this2.driver.validateCapabilities(new Set(caps.capabilities))
          }).then(function(allowedCaps) {
            _this2.allowCapabilities(_toConsumableArray(allowedCaps), requestedCaps)
            _this2.emit('ready')
          })['catch'](function(e) {
            _this2.emit('error:preparing', e)
          })
        }, 'beginCapabilities'),
      }, {
        key: 'allowCapabilities',
        value: /* @__PURE__ */ __name(function allowCapabilities(allowed, requested) {
          let _this$allowedEvents; const _this3 = this
          console.log('Widget '.concat(this.widget.id, ' is allowed capabilities:'), allowed)
          const _iterator2 = _createForOfIteratorHelper(allowed); let _step2
          try {
            for (_iterator2.s(); !(_step2 = _iterator2.n()).done; ) {
              const c = _step2.value
              this.allowedCapabilities.add(c)
            }
          } catch (err) {
            _iterator2.e(err)
          } finally {
            _iterator2.f()
          }
          const allowedEvents = _WidgetEventCapability.WidgetEventCapability.findEventCapabilities(allowed);
          (_this$allowedEvents = this.allowedEvents).push.apply(_this$allowedEvents, _toConsumableArray(allowedEvents))
          this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.NotifyCapabilities, {
            requested,
            approved: Array.from(this.allowedCapabilities),
          })['catch'](function(e) {
            console.warn('non-fatal error notifying widget of approved capabilities:', e)
          }).then(function() {
            _this3.emit('capabilitiesNotified')
          })
          const _iterator3 = _createForOfIteratorHelper(allowed); let _step3
          try {
            for (_iterator3.s(); !(_step3 = _iterator3.n()).done; ) {
              const _c = _step3.value
              if ((0, _Capabilities.isTimelineCapability)(_c)) {
                const roomId = (0, _Capabilities.getTimelineRoomIDFromCapability)(_c)
                if (roomId === _Symbols.Symbols.AnyRoom) {
                  const _iterator4 = _createForOfIteratorHelper(this.driver.getKnownRooms()); var _step4
                  try {
                    for (_iterator4.s(); !(_step4 = _iterator4.n()).done; ) {
                      const _roomId = _step4.value
                      this.pushRoomState(_roomId)
                    }
                  } catch (err) {
                    _iterator4.e(err)
                  } finally {
                    _iterator4.f()
                  }
                } else {
                  this.pushRoomState(roomId)
                }
              }
            }
          } catch (err) {
            _iterator3.e(err)
          } finally {
            _iterator3.f()
          }
          if (allowedEvents.length > 0 && this.viewedRoomId !== null && !this.canUseRoomTimeline(this.viewedRoomId)) {
            this.pushRoomState(this.viewedRoomId)
          }
        }, 'allowCapabilities'),
      }, {
        key: 'onIframeLoad',
        value: /* @__PURE__ */ __name(function onIframeLoad(ev) {
          if (this.widget.waitForIframeLoad) {
            this.beginCapabilities()
          } else {
            console.log('waitForIframeLoad is false: waiting for widget to send contentLoaded')
            this.contentLoadedWaitTimer = setTimeout(function() {
              console.error('Widget specified waitForIframeLoad=false but timed out waiting for contentLoaded event!')
            }, 1e4)
            this.contentLoadedActionSent = false
          }
        }, 'onIframeLoad'),
      }, {
        key: 'handleContentLoadedAction',
        value: /* @__PURE__ */ __name(function handleContentLoadedAction(action) {
          if (this.contentLoadedWaitTimer !== void 0) {
            clearTimeout(this.contentLoadedWaitTimer)
            this.contentLoadedWaitTimer = void 0
          }
          if (this.contentLoadedActionSent) {
            throw new Error('Improper sequence: ContentLoaded Action can only be sent once after the widget loaded and should only be used if waitForIframeLoad is false (default=true)')
          }
          if (this.widget.waitForIframeLoad) {
            this.transport.reply(action, {
              error: {
                message: 'Improper sequence: not expecting ContentLoaded event if waitForIframeLoad is true (default=true)',
              },
            })
          } else {
            this.transport.reply(action, {})
            this.beginCapabilities()
          }
          this.contentLoadedActionSent = true
        }, 'handleContentLoadedAction'),
      }, {
        key: 'replyVersions',
        value: /* @__PURE__ */ __name(function replyVersions(request) {
          this.transport.reply(request, {
            supported_versions: _ApiVersion.CurrentApiVersions,
          })
        }, 'replyVersions'),
      }, {
        key: 'supportsUpdateState',
        value: function() {
          const _supportsUpdateState = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee2() {
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee2$(_context2) {
              while (1) {
switch (_context2.prev = _context2.next) {
                  case 0:
                    _context2.next = 2
                    return this.getWidgetVersions()
                  case 2:
                    return _context2.abrupt('return', _context2.sent.includes(_ApiVersion.UnstableApiVersion.MSC2762_UPDATE_STATE))
                  case 3:
                  case 'end':
                    return _context2.stop()
                }
}
            }, '_callee2$'), _callee2, this)
          }, '_callee2')))
          /**
           *
           */
          function supportsUpdateState() {
            return _supportsUpdateState.apply(this, arguments)
          }
          __name(supportsUpdateState, 'supportsUpdateState')
          return supportsUpdateState
        }(),
      }, {
        key: 'handleCapabilitiesRenegotiate',
        value: /* @__PURE__ */ __name(function handleCapabilitiesRenegotiate(request) {
          let _request$data; const _this4 = this
          this.transport.reply(request, {})
          const requested = ((_request$data = request.data) === null || _request$data === void 0 ? void 0 : _request$data.capabilities) || []
          const newlyRequested = new Set(requested.filter(function(r) {
            return !_this4.hasCapability(r)
          }))
          if (newlyRequested.size === 0) {
            this.allowCapabilities([], [])
          }
          this.driver.validateCapabilities(newlyRequested).then(function(allowed) {
            return _this4.allowCapabilities(_toConsumableArray(allowed), _toConsumableArray(newlyRequested))
          })
        }, 'handleCapabilitiesRenegotiate'),
      }, {
        key: 'handleNavigate',
        value: /* @__PURE__ */ __name(function handleNavigate(request) {
          let _request$data2; let _request$data3; const _this5 = this
          if (!this.hasCapability(_Capabilities.MatrixCapabilities.MSC2931Navigate)) {
            return this.transport.reply(request, {
              error: {
                message: 'Missing capability',
              },
            })
          }
          if (!((_request$data2 = request.data) !== null && _request$data2 !== void 0 && _request$data2.uri) || !((_request$data3 = request.data) !== null && _request$data3 !== void 0 && _request$data3.uri.toString().startsWith('https://matrix.to/#'))) {
            return this.transport.reply(request, {
              error: {
                message: 'Invalid matrix.to URI',
              },
            })
          }
          const onErr = /* @__PURE__ */ __name(function onErr2(e) {
            console.error('[ClientWidgetApi] Failed to handle navigation: ', e)
            _this5.handleDriverError(e, request, 'Error handling navigation')
          }, 'onErr')
          try {
            this.driver.navigate(request.data.uri.toString())['catch'](function(e) {
              return onErr(e)
            }).then(function() {
              return _this5.transport.reply(request, {})
            })
          } catch (e) {
            return onErr(e)
          }
        }, 'handleNavigate'),
      }, {
        key: 'handleOIDC',
        value: /* @__PURE__ */ __name(function handleOIDC(request) {
          const _this6 = this
          let phase = 1
          const replyState = /* @__PURE__ */ __name(function replyState2(state, credential) {
            credential = credential || {}
            if (phase > 1) {
              return _this6.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.OpenIDCredentials, _objectSpread({
                state,
                original_request_id: request.requestId,
              }, credential))
            } else {
              return _this6.transport.reply(request, _objectSpread({
                state,
              }, credential))
            }
          }, 'replyState')
          const replyError = /* @__PURE__ */ __name(function replyError2(msg) {
            console.error('[ClientWidgetApi] Failed to handle OIDC: ', msg)
            if (phase > 1) {
              return replyState(_GetOpenIDAction.OpenIDRequestState.Blocked)
            } else {
              return _this6.transport.reply(request, {
                error: {
                  message: msg,
                },
              })
            }
          }, 'replyError')
          var observer = new _SimpleObservable.SimpleObservable(function(update) {
            if (update.state === _GetOpenIDAction.OpenIDRequestState.PendingUserConfirmation && phase > 1) {
              observer.close()
              return replyError('client provided out-of-phase response to OIDC flow')
            }
            if (update.state === _GetOpenIDAction.OpenIDRequestState.PendingUserConfirmation) {
              replyState(update.state)
              phase++
              return
            }
            if (update.state === _GetOpenIDAction.OpenIDRequestState.Allowed && !update.token) {
              return replyError('client provided invalid OIDC token for an allowed request')
            }
            if (update.state === _GetOpenIDAction.OpenIDRequestState.Blocked) {
              update.token = void 0
            }
            observer.close()
            return replyState(update.state, update.token)
          })
          this.driver.askOpenID(observer)
        }, 'handleOIDC'),
      }, {
        key: 'handleReadRoomAccountData',
        value: /* @__PURE__ */ __name(function handleReadRoomAccountData(request) {
          const _this7 = this
          let events = Promise.resolve([])
          events = this.driver.readRoomAccountData(request.data.type)
          if (!this.canReceiveRoomAccountData(request.data.type)) {
            return this.transport.reply(request, {
              error: {
                message: 'Cannot read room account data of this type',
              },
            })
          }
          return events.then(function(evs) {
            _this7.transport.reply(request, {
              events: evs,
            })
          })
        }, 'handleReadRoomAccountData'),
      }, {
        key: 'handleReadEvents',
        value: function() {
          const _handleReadEvents = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee3(request) {
            const _this8 = this
            let askRoomIds; let _iterator5; let _step5; let roomId; let limit; let since; let stateKey; let msgtype; let _stateKey; let events
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee3$(_context3) {
              while (1) {
switch (_context3.prev = _context3.next) {
                  case 0:
                    if (request.data.type) {
                      _context3.next = 2
                      break
                    }
                    return _context3.abrupt('return', this.transport.reply(request, {
                      error: {
                        message: 'Invalid request - missing event type',
                      },
                    }))
                  case 2:
                    if (!(request.data.limit !== void 0 && (!request.data.limit || request.data.limit < 0))) {
                      _context3.next = 4
                      break
                    }
                    return _context3.abrupt('return', this.transport.reply(request, {
                      error: {
                        message: 'Invalid request - limit out of range',
                      },
                    }))
                  case 4:
                    if (!(request.data.room_ids === void 0)) {
                      _context3.next = 8
                      break
                    }
                    askRoomIds = this.viewedRoomId === null ? [] : [this.viewedRoomId]
                    _context3.next = 30
                    break
                  case 8:
                    if (!(request.data.room_ids === _Symbols.Symbols.AnyRoom)) {
                      _context3.next = 12
                      break
                    }
                    askRoomIds = this.driver.getKnownRooms().filter(function(roomId2) {
                      return _this8.canUseRoomTimeline(roomId2)
                    })
                    _context3.next = 30
                    break
                  case 12:
                    askRoomIds = request.data.room_ids
                    _iterator5 = _createForOfIteratorHelper(askRoomIds)
                    _context3.prev = 14
                    _iterator5.s()
                  case 16:
                    if ((_step5 = _iterator5.n()).done) {
                      _context3.next = 22
                      break
                    }
                    roomId = _step5.value
                    if (this.canUseRoomTimeline(roomId)) {
                      _context3.next = 20
                      break
                    }
                    return _context3.abrupt('return', this.transport.reply(request, {
                      error: {
                        message: 'Unable to access room timeline: '.concat(roomId),
                      },
                    }))
                  case 20:
                    _context3.next = 16
                    break
                  case 22:
                    _context3.next = 27
                    break
                  case 24:
                    _context3.prev = 24
                    _context3.t0 = _context3['catch'](14)
                    _iterator5.e(_context3.t0)
                  case 27:
                    _context3.prev = 27
                    _iterator5.f()
                    return _context3.finish(27)
                  case 30:
                    limit = request.data.limit || 0
                    since = request.data.since
                    stateKey = void 0
                    msgtype = void 0
                    if (!(request.data.state_key !== void 0)) {
                      _context3.next = 40
                      break
                    }
                    stateKey = request.data.state_key === true ? void 0 : request.data.state_key.toString()
                    if (this.canReceiveStateEvent(request.data.type, (_stateKey = stateKey) !== null && _stateKey !== void 0 ? _stateKey : null)) {
                      _context3.next = 38
                      break
                    }
                    return _context3.abrupt('return', this.transport.reply(request, {
                      error: {
                        message: 'Cannot read state events of this type',
                      },
                    }))
                  case 38:
                    _context3.next = 43
                    break
                  case 40:
                    msgtype = request.data.msgtype
                    if (this.canReceiveRoomEvent(request.data.type, msgtype)) {
                      _context3.next = 43
                      break
                    }
                    return _context3.abrupt('return', this.transport.reply(request, {
                      error: {
                        message: 'Cannot read room events of this type',
                      },
                    }))
                  case 43:
                    if (!(request.data.room_ids === void 0 && askRoomIds.length === 0)) {
                      _context3.next = 50
                      break
                    }
                    console.warn('The widgetDriver uses deprecated behaviour:\n It does not set the viewedRoomId using `setViewedRoomId`')
                    _context3.next = 47
                    return (
                      // This returns [] with the current driver of Element Web.
                      // Add default implementations of the `readRoomEvents` and `readStateEvents`
                      // methods to use `readRoomTimeline` and `readRoomState` if they are not overwritten.
                      request.data.state_key === void 0 ? this.driver.readRoomEvents(request.data.type, msgtype, limit, null, since) : this.driver.readStateEvents(request.data.type, stateKey, limit, null)
                    )
                  case 47:
                    events = _context3.sent
                    _context3.next = 68
                    break
                  case 50:
                    _context3.next = 52
                    return this.supportsUpdateState()
                  case 52:
                    if (!_context3.sent) {
                      _context3.next = 58
                      break
                    }
                    _context3.next = 55
                    return Promise.all(askRoomIds.map(function(roomId2) {
                      return _this8.driver.readRoomTimeline(roomId2, request.data.type, msgtype, stateKey, limit, since)
                    }))
                  case 55:
                    events = _context3.sent.flat(1)
                    _context3.next = 68
                    break
                  case 58:
                    if (!(request.data.state_key === void 0)) {
                      _context3.next = 64
                      break
                    }
                    _context3.next = 61
                    return Promise.all(askRoomIds.map(function(roomId2) {
                      return _this8.driver.readRoomTimeline(roomId2, request.data.type, msgtype, stateKey, limit, since)
                    }))
                  case 61:
                    _context3.t1 = _context3.sent
                    _context3.next = 67
                    break
                  case 64:
                    _context3.next = 66
                    return Promise.all(askRoomIds.map(function(roomId2) {
                      return _this8.driver.readRoomState(roomId2, request.data.type, stateKey)
                    }))
                  case 66:
                    _context3.t1 = _context3.sent
                  case 67:
                    events = _context3.t1.flat(1)
                  case 68:
                    this.transport.reply(request, {
                      events,
                    })
                  case 69:
                  case 'end':
                    return _context3.stop()
                }
}
            }, '_callee3$'), _callee3, this, [[14, 24, 27, 30]])
          }, '_callee3')))
          /**
           *
           */
          function handleReadEvents(_x) {
            return _handleReadEvents.apply(this, arguments)
          }
          __name(handleReadEvents, 'handleReadEvents')
          return handleReadEvents
        }(),
      }, {
        key: 'handleSendEvent',
        value: /* @__PURE__ */ __name(function handleSendEvent(request) {
          const _this9 = this
          if (!request.data.type) {
            return this.transport.reply(request, {
              error: {
                message: 'Invalid request - missing event type',
              },
            })
          }
          if (!!request.data.room_id && !this.canUseRoomTimeline(request.data.room_id)) {
            return this.transport.reply(request, {
              error: {
                message: 'Unable to access room timeline: '.concat(request.data.room_id),
              },
            })
          }
          const isDelayedEvent = request.data.delay !== void 0 || request.data.parent_delay_id !== void 0
          if (isDelayedEvent && !this.hasCapability(_Capabilities.MatrixCapabilities.MSC4157SendDelayedEvent)) {
            return this.transport.reply(request, {
              error: {
                message: 'Missing capability',
              },
            })
          }
          let sendEventPromise
          if (request.data.state_key !== void 0) {
            if (!this.canSendStateEvent(request.data.type, request.data.state_key)) {
              return this.transport.reply(request, {
                error: {
                  message: 'Cannot send state events of this type',
                },
              })
            }
            if (!isDelayedEvent) {
              sendEventPromise = this.driver.sendEvent(request.data.type, request.data.content || {}, request.data.state_key, request.data.room_id)
            } else {
              let _request$data$delay; let _request$data$parent_
              sendEventPromise = this.driver.sendDelayedEvent((_request$data$delay = request.data.delay) !== null && _request$data$delay !== void 0 ? _request$data$delay : null, (_request$data$parent_ = request.data.parent_delay_id) !== null && _request$data$parent_ !== void 0 ? _request$data$parent_ : null, request.data.type, request.data.content || {}, request.data.state_key, request.data.room_id)
            }
          } else {
            const content = request.data.content || {}
            const msgtype = content['msgtype']
            if (!this.canSendRoomEvent(request.data.type, msgtype)) {
              return this.transport.reply(request, {
                error: {
                  message: 'Cannot send room events of this type',
                },
              })
            }
            if (!isDelayedEvent) {
              sendEventPromise = this.driver.sendEvent(
                request.data.type,
                content,
                null,
                // not sending a state event
                request.data.room_id,
              )
            } else {
              let _request$data$delay2; let _request$data$parent_2
              sendEventPromise = this.driver.sendDelayedEvent(
                (_request$data$delay2 = request.data.delay) !== null && _request$data$delay2 !== void 0 ? _request$data$delay2 : null,
                (_request$data$parent_2 = request.data.parent_delay_id) !== null && _request$data$parent_2 !== void 0 ? _request$data$parent_2 : null,
                request.data.type,
                content,
                null,
                // not sending a state event
                request.data.room_id,
              )
            }
          }
          sendEventPromise.then(function(sentEvent) {
            return _this9.transport.reply(request, _objectSpread({
              room_id: sentEvent.roomId,
            }, 'eventId' in sentEvent ? {
              event_id: sentEvent.eventId,
            } : {
              delay_id: sentEvent.delayId,
            }))
          })['catch'](function(e) {
            console.error('error sending event: ', e)
            _this9.handleDriverError(e, request, 'Error sending event')
          })
        }, 'handleSendEvent'),
      }, {
        key: 'handleUpdateDelayedEvent',
        value: /* @__PURE__ */ __name(function handleUpdateDelayedEvent(request) {
          const _this10 = this
          if (!request.data.delay_id) {
            return this.transport.reply(request, {
              error: {
                message: 'Invalid request - missing delay_id',
              },
            })
          }
          if (!this.hasCapability(_Capabilities.MatrixCapabilities.MSC4157UpdateDelayedEvent)) {
            return this.transport.reply(request, {
              error: {
                message: 'Missing capability',
              },
            })
          }
          switch (request.data.action) {
            case _UpdateDelayedEventAction.UpdateDelayedEventAction.Cancel:
            case _UpdateDelayedEventAction.UpdateDelayedEventAction.Restart:
            case _UpdateDelayedEventAction.UpdateDelayedEventAction.Send:
              this.driver.updateDelayedEvent(request.data.delay_id, request.data.action).then(function() {
                return _this10.transport.reply(request, {})
              })['catch'](function(e) {
                console.error('error updating delayed event: ', e)
                _this10.handleDriverError(e, request, 'Error updating delayed event')
              })
              break
            default:
              return this.transport.reply(request, {
                error: {
                  message: 'Invalid request - unsupported action',
                },
              })
          }
        }, 'handleUpdateDelayedEvent'),
      }, {
        key: 'handleSendToDevice',
        value: function() {
          const _handleSendToDevice = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee4(request) {
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee4$(_context4) {
              while (1) {
switch (_context4.prev = _context4.next) {
                  case 0:
                    if (request.data.type) {
                      _context4.next = 5
                      break
                    }
                    _context4.next = 3
                    return this.transport.reply(request, {
                      error: {
                        message: 'Invalid request - missing event type',
                      },
                    })
                  case 3:
                    _context4.next = 31
                    break
                  case 5:
                    if (request.data.messages) {
                      _context4.next = 10
                      break
                    }
                    _context4.next = 8
                    return this.transport.reply(request, {
                      error: {
                        message: 'Invalid request - missing event contents',
                      },
                    })
                  case 8:
                    _context4.next = 31
                    break
                  case 10:
                    if (!(typeof request.data.encrypted !== 'boolean')) {
                      _context4.next = 15
                      break
                    }
                    _context4.next = 13
                    return this.transport.reply(request, {
                      error: {
                        message: 'Invalid request - missing encryption flag',
                      },
                    })
                  case 13:
                    _context4.next = 31
                    break
                  case 15:
                    if (this.canSendToDeviceEvent(request.data.type)) {
                      _context4.next = 20
                      break
                    }
                    _context4.next = 18
                    return this.transport.reply(request, {
                      error: {
                        message: 'Cannot send to-device events of this type',
                      },
                    })
                  case 18:
                    _context4.next = 31
                    break
                  case 20:
                    _context4.prev = 20
                    _context4.next = 23
                    return this.driver.sendToDevice(request.data.type, request.data.encrypted, request.data.messages)
                  case 23:
                    _context4.next = 25
                    return this.transport.reply(request, {})
                  case 25:
                    _context4.next = 31
                    break
                  case 27:
                    _context4.prev = 27
                    _context4.t0 = _context4['catch'](20)
                    console.error('error sending to-device event', _context4.t0)
                    this.handleDriverError(_context4.t0, request, 'Error sending event')
                  case 31:
                  case 'end':
                    return _context4.stop()
                }
}
            }, '_callee4$'), _callee4, this, [[20, 27]])
          }, '_callee4')))
          /**
           *
           */
          function handleSendToDevice(_x2) {
            return _handleSendToDevice.apply(this, arguments)
          }
          __name(handleSendToDevice, 'handleSendToDevice')
          return handleSendToDevice
        }(),
      }, {
        key: 'pollTurnServers',
        value: function() {
          const _pollTurnServers = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee5(turnServers, initialServer) {
            let _iteratorAbruptCompletion; let _didIteratorError; let _iteratorError; let _iterator; let _step; let server
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee5$(_context5) {
              while (1) {
switch (_context5.prev = _context5.next) {
                  case 0:
                    _context5.prev = 0
                    _context5.next = 3
                    return this.transport.send(
                      _WidgetApiAction.WidgetApiToWidgetAction.UpdateTurnServers,
                      initialServer,
                      // it's compatible, but missing the index signature
                    )
                  case 3:
                    _iteratorAbruptCompletion = false
                    _didIteratorError = false
                    _context5.prev = 5
                    _iterator = _asyncIterator(turnServers)
                  case 7:
                    _context5.next = 9
                    return _iterator.next()
                  case 9:
                    if (!(_iteratorAbruptCompletion = !(_step = _context5.sent).done)) {
                      _context5.next = 16
                      break
                    }
                    server = _step.value
                    _context5.next = 13
                    return this.transport.send(
                      _WidgetApiAction.WidgetApiToWidgetAction.UpdateTurnServers,
                      server,
                      // it's compatible, but missing the index signature
                    )
                  case 13:
                    _iteratorAbruptCompletion = false
                    _context5.next = 7
                    break
                  case 16:
                    _context5.next = 22
                    break
                  case 18:
                    _context5.prev = 18
                    _context5.t0 = _context5['catch'](5)
                    _didIteratorError = true
                    _iteratorError = _context5.t0
                  case 22:
                    _context5.prev = 22
                    _context5.prev = 23
                    if (!(_iteratorAbruptCompletion && _iterator['return'] != null)) {
                      _context5.next = 27
                      break
                    }
                    _context5.next = 27
                    return _iterator['return']()
                  case 27:
                    _context5.prev = 27
                    if (!_didIteratorError) {
                      _context5.next = 30
                      break
                    }
                    throw _iteratorError
                  case 30:
                    return _context5.finish(27)
                  case 31:
                    return _context5.finish(22)
                  case 32:
                    _context5.next = 37
                    break
                  case 34:
                    _context5.prev = 34
                    _context5.t1 = _context5['catch'](0)
                    console.error('error polling for TURN servers', _context5.t1)
                  case 37:
                  case 'end':
                    return _context5.stop()
                }
}
            }, '_callee5$'), _callee5, this, [[0, 34], [5, 18, 22, 32], [23, , 27, 31]])
          }, '_callee5')))
          /**
           *
           */
          function pollTurnServers(_x3, _x4) {
            return _pollTurnServers.apply(this, arguments)
          }
          __name(pollTurnServers, 'pollTurnServers')
          return pollTurnServers
        }(),
      }, {
        key: 'handleWatchTurnServers',
        value: function() {
          const _handleWatchTurnServers = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee6(request) {
            let turnServers; let _yield$turnServers$ne; let done; let value
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee6$(_context6) {
              while (1) {
switch (_context6.prev = _context6.next) {
                  case 0:
                    if (this.hasCapability(_Capabilities.MatrixCapabilities.MSC3846TurnServers)) {
                      _context6.next = 5
                      break
                    }
                    _context6.next = 3
                    return this.transport.reply(request, {
                      error: {
                        message: 'Missing capability',
                      },
                    })
                  case 3:
                    _context6.next = 30
                    break
                  case 5:
                    if (!this.turnServers) {
                      _context6.next = 10
                      break
                    }
                    _context6.next = 8
                    return this.transport.reply(request, {})
                  case 8:
                    _context6.next = 30
                    break
                  case 10:
                    _context6.prev = 10
                    turnServers = this.driver.getTurnServers()
                    _context6.next = 14
                    return turnServers.next()
                  case 14:
                    _yield$turnServers$ne = _context6.sent
                    done = _yield$turnServers$ne.done
                    value = _yield$turnServers$ne.value
                    if (!done) {
                      _context6.next = 19
                      break
                    }
                    throw new Error('Client refuses to provide any TURN servers')
                  case 19:
                    _context6.next = 21
                    return this.transport.reply(request, {})
                  case 21:
                    this.pollTurnServers(turnServers, value)
                    this.turnServers = turnServers
                    _context6.next = 30
                    break
                  case 25:
                    _context6.prev = 25
                    _context6.t0 = _context6['catch'](10)
                    console.error('error getting first TURN server results', _context6.t0)
                    _context6.next = 30
                    return this.transport.reply(request, {
                      error: {
                        message: 'TURN servers not available',
                      },
                    })
                  case 30:
                  case 'end':
                    return _context6.stop()
                }
}
            }, '_callee6$'), _callee6, this, [[10, 25]])
          }, '_callee6')))
          /**
           *
           */
          function handleWatchTurnServers(_x5) {
            return _handleWatchTurnServers.apply(this, arguments)
          }
          __name(handleWatchTurnServers, 'handleWatchTurnServers')
          return handleWatchTurnServers
        }(),
      }, {
        key: 'handleUnwatchTurnServers',
        value: function() {
          const _handleUnwatchTurnServers = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee7(request) {
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee7$(_context7) {
              while (1) {
switch (_context7.prev = _context7.next) {
                  case 0:
                    if (this.hasCapability(_Capabilities.MatrixCapabilities.MSC3846TurnServers)) {
                      _context7.next = 5
                      break
                    }
                    _context7.next = 3
                    return this.transport.reply(request, {
                      error: {
                        message: 'Missing capability',
                      },
                    })
                  case 3:
                    _context7.next = 15
                    break
                  case 5:
                    if (this.turnServers) {
                      _context7.next = 10
                      break
                    }
                    _context7.next = 8
                    return this.transport.reply(request, {})
                  case 8:
                    _context7.next = 15
                    break
                  case 10:
                    _context7.next = 12
                    return this.turnServers['return'](void 0)
                  case 12:
                    this.turnServers = null
                    _context7.next = 15
                    return this.transport.reply(request, {})
                  case 15:
                  case 'end':
                    return _context7.stop()
                }
}
            }, '_callee7$'), _callee7, this)
          }, '_callee7')))
          /**
           *
           */
          function handleUnwatchTurnServers(_x6) {
            return _handleUnwatchTurnServers.apply(this, arguments)
          }
          __name(handleUnwatchTurnServers, 'handleUnwatchTurnServers')
          return handleUnwatchTurnServers
        }(),
      }, {
        key: 'handleReadRelations',
        value: function() {
          const _handleReadRelations = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee8(request) {
            const _this11 = this
            let result; let chunk
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee8$(_context8) {
              while (1) {
switch (_context8.prev = _context8.next) {
                  case 0:
                    if (request.data.event_id) {
                      _context8.next = 2
                      break
                    }
                    return _context8.abrupt('return', this.transport.reply(request, {
                      error: {
                        message: 'Invalid request - missing event ID',
                      },
                    }))
                  case 2:
                    if (!(request.data.limit !== void 0 && request.data.limit < 0)) {
                      _context8.next = 4
                      break
                    }
                    return _context8.abrupt('return', this.transport.reply(request, {
                      error: {
                        message: 'Invalid request - limit out of range',
                      },
                    }))
                  case 4:
                    if (!(request.data.room_id !== void 0 && !this.canUseRoomTimeline(request.data.room_id))) {
                      _context8.next = 6
                      break
                    }
                    return _context8.abrupt('return', this.transport.reply(request, {
                      error: {
                        message: 'Unable to access room timeline: '.concat(request.data.room_id),
                      },
                    }))
                  case 6:
                    _context8.prev = 6
                    _context8.next = 9
                    return this.driver.readEventRelations(request.data.event_id, request.data.room_id, request.data.rel_type, request.data.event_type, request.data.from, request.data.to, request.data.limit, request.data.direction)
                  case 9:
                    result = _context8.sent
                    chunk = result.chunk.filter(function(e) {
                      if (e.state_key !== void 0) {
                        return _this11.canReceiveStateEvent(e.type, e.state_key)
                      } else {
                        return _this11.canReceiveRoomEvent(e.type, e.content['msgtype'])
                      }
                    })
                    return _context8.abrupt('return', this.transport.reply(request, {
                      chunk,
                      prev_batch: result.prevBatch,
                      next_batch: result.nextBatch,
                    }))
                  case 14:
                    _context8.prev = 14
                    _context8.t0 = _context8['catch'](6)
                    console.error('error getting the relations', _context8.t0)
                    this.handleDriverError(_context8.t0, request, 'Unexpected error while reading relations')
                  case 18:
                  case 'end':
                    return _context8.stop()
                }
}
            }, '_callee8$'), _callee8, this, [[6, 14]])
          }, '_callee8')))
          /**
           *
           */
          function handleReadRelations(_x7) {
            return _handleReadRelations.apply(this, arguments)
          }
          __name(handleReadRelations, 'handleReadRelations')
          return handleReadRelations
        }(),
      }, {
        key: 'handleUserDirectorySearch',
        value: function() {
          const _handleUserDirectorySearch = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee9(request) {
            let result
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee9$(_context9) {
              while (1) {
switch (_context9.prev = _context9.next) {
                  case 0:
                    if (this.hasCapability(_Capabilities.MatrixCapabilities.MSC3973UserDirectorySearch)) {
                      _context9.next = 2
                      break
                    }
                    return _context9.abrupt('return', this.transport.reply(request, {
                      error: {
                        message: 'Missing capability',
                      },
                    }))
                  case 2:
                    if (!(typeof request.data.search_term !== 'string')) {
                      _context9.next = 4
                      break
                    }
                    return _context9.abrupt('return', this.transport.reply(request, {
                      error: {
                        message: 'Invalid request - missing search term',
                      },
                    }))
                  case 4:
                    if (!(request.data.limit !== void 0 && request.data.limit < 0)) {
                      _context9.next = 6
                      break
                    }
                    return _context9.abrupt('return', this.transport.reply(request, {
                      error: {
                        message: 'Invalid request - limit out of range',
                      },
                    }))
                  case 6:
                    _context9.prev = 6
                    _context9.next = 9
                    return this.driver.searchUserDirectory(request.data.search_term, request.data.limit)
                  case 9:
                    result = _context9.sent
                    return _context9.abrupt('return', this.transport.reply(request, {
                      limited: result.limited,
                      results: result.results.map(function(r) {
                        return {
                          user_id: r.userId,
                          display_name: r.displayName,
                          avatar_url: r.avatarUrl,
                        }
                      }),
                    }))
                  case 13:
                    _context9.prev = 13
                    _context9.t0 = _context9['catch'](6)
                    console.error('error searching in the user directory', _context9.t0)
                    this.handleDriverError(_context9.t0, request, 'Unexpected error while searching in the user directory')
                  case 17:
                  case 'end':
                    return _context9.stop()
                }
}
            }, '_callee9$'), _callee9, this, [[6, 13]])
          }, '_callee9')))
          /**
           *
           */
          function handleUserDirectorySearch(_x8) {
            return _handleUserDirectorySearch.apply(this, arguments)
          }
          __name(handleUserDirectorySearch, 'handleUserDirectorySearch')
          return handleUserDirectorySearch
        }(),
      }, {
        key: 'handleGetMediaConfig',
        value: function() {
          const _handleGetMediaConfig = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee10(request) {
            let result
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee10$(_context10) {
              while (1) {
switch (_context10.prev = _context10.next) {
                  case 0:
                    if (this.hasCapability(_Capabilities.MatrixCapabilities.MSC4039UploadFile)) {
                      _context10.next = 2
                      break
                    }
                    return _context10.abrupt('return', this.transport.reply(request, {
                      error: {
                        message: 'Missing capability',
                      },
                    }))
                  case 2:
                    _context10.prev = 2
                    _context10.next = 5
                    return this.driver.getMediaConfig()
                  case 5:
                    result = _context10.sent
                    return _context10.abrupt('return', this.transport.reply(request, result))
                  case 9:
                    _context10.prev = 9
                    _context10.t0 = _context10['catch'](2)
                    console.error('error while getting the media configuration', _context10.t0)
                    this.handleDriverError(_context10.t0, request, 'Unexpected error while getting the media configuration')
                  case 13:
                  case 'end':
                    return _context10.stop()
                }
}
            }, '_callee10$'), _callee10, this, [[2, 9]])
          }, '_callee10')))
          /**
           *
           */
          function handleGetMediaConfig(_x9) {
            return _handleGetMediaConfig.apply(this, arguments)
          }
          __name(handleGetMediaConfig, 'handleGetMediaConfig')
          return handleGetMediaConfig
        }(),
      }, {
        key: 'handleUploadFile',
        value: function() {
          const _handleUploadFile = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee11(request) {
            let result
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee11$(_context11) {
              while (1) {
switch (_context11.prev = _context11.next) {
                  case 0:
                    if (this.hasCapability(_Capabilities.MatrixCapabilities.MSC4039UploadFile)) {
                      _context11.next = 2
                      break
                    }
                    return _context11.abrupt('return', this.transport.reply(request, {
                      error: {
                        message: 'Missing capability',
                      },
                    }))
                  case 2:
                    _context11.prev = 2
                    _context11.next = 5
                    return this.driver.uploadFile(request.data.file)
                  case 5:
                    result = _context11.sent
                    return _context11.abrupt('return', this.transport.reply(request, {
                      content_uri: result.contentUri,
                    }))
                  case 9:
                    _context11.prev = 9
                    _context11.t0 = _context11['catch'](2)
                    console.error('error while uploading a file', _context11.t0)
                    this.handleDriverError(_context11.t0, request, 'Unexpected error while uploading a file')
                  case 13:
                  case 'end':
                    return _context11.stop()
                }
}
            }, '_callee11$'), _callee11, this, [[2, 9]])
          }, '_callee11')))
          /**
           *
           */
          function handleUploadFile(_x10) {
            return _handleUploadFile.apply(this, arguments)
          }
          __name(handleUploadFile, 'handleUploadFile')
          return handleUploadFile
        }(),
      }, {
        key: 'handleDownloadFile',
        value: function() {
          const _handleDownloadFile = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee12(request) {
            let result
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee12$(_context12) {
              while (1) {
switch (_context12.prev = _context12.next) {
                  case 0:
                    if (this.hasCapability(_Capabilities.MatrixCapabilities.MSC4039DownloadFile)) {
                      _context12.next = 2
                      break
                    }
                    return _context12.abrupt('return', this.transport.reply(request, {
                      error: {
                        message: 'Missing capability',
                      },
                    }))
                  case 2:
                    _context12.prev = 2
                    _context12.next = 5
                    return this.driver.downloadFile(request.data.content_uri)
                  case 5:
                    result = _context12.sent
                    return _context12.abrupt('return', this.transport.reply(request, {
                      file: result.file,
                    }))
                  case 9:
                    _context12.prev = 9
                    _context12.t0 = _context12['catch'](2)
                    console.error('error while downloading a file', _context12.t0)
                    this.handleDriverError(_context12.t0, request, 'Unexpected error while downloading a file')
                  case 13:
                  case 'end':
                    return _context12.stop()
                }
}
            }, '_callee12$'), _callee12, this, [[2, 9]])
          }, '_callee12')))
          /**
           *
           */
          function handleDownloadFile(_x11) {
            return _handleDownloadFile.apply(this, arguments)
          }
          __name(handleDownloadFile, 'handleDownloadFile')
          return handleDownloadFile
        }(),
      }, {
        key: 'handleDriverError',
        value: /* @__PURE__ */ __name(function handleDriverError(e, request, message) {
          const data = this.driver.processError(e)
          this.transport.reply(request, {
            error: _objectSpread({
              message,
            }, data),
          })
        }, 'handleDriverError'),
      }, {
        key: 'handleMessage',
        value: /* @__PURE__ */ __name(function handleMessage(ev) {
          if (this.isStopped) {
return
}
          const actionEv = new CustomEvent('action:'.concat(ev.detail.action), {
            detail: ev.detail,
            cancelable: true,
          })
          this.emit('action:'.concat(ev.detail.action), actionEv)
          if (!actionEv.defaultPrevented) {
            switch (ev.detail.action) {
              case _WidgetApiAction.WidgetApiFromWidgetAction.ContentLoaded:
                return this.handleContentLoadedAction(ev.detail)
              case _WidgetApiAction.WidgetApiFromWidgetAction.SupportedApiVersions:
                return this.replyVersions(ev.detail)
              case _WidgetApiAction.WidgetApiFromWidgetAction.SendEvent:
                return this.handleSendEvent(ev.detail)
              case _WidgetApiAction.WidgetApiFromWidgetAction.SendToDevice:
                return this.handleSendToDevice(ev.detail)
              case _WidgetApiAction.WidgetApiFromWidgetAction.GetOpenIDCredentials:
                return this.handleOIDC(ev.detail)
              case _WidgetApiAction.WidgetApiFromWidgetAction.MSC2931Navigate:
                return this.handleNavigate(ev.detail)
              case _WidgetApiAction.WidgetApiFromWidgetAction.MSC2974RenegotiateCapabilities:
                return this.handleCapabilitiesRenegotiate(ev.detail)
              case _WidgetApiAction.WidgetApiFromWidgetAction.MSC2876ReadEvents:
                return this.handleReadEvents(ev.detail)
              case _WidgetApiAction.WidgetApiFromWidgetAction.WatchTurnServers:
                return this.handleWatchTurnServers(ev.detail)
              case _WidgetApiAction.WidgetApiFromWidgetAction.UnwatchTurnServers:
                return this.handleUnwatchTurnServers(ev.detail)
              case _WidgetApiAction.WidgetApiFromWidgetAction.MSC3869ReadRelations:
                return this.handleReadRelations(ev.detail)
              case _WidgetApiAction.WidgetApiFromWidgetAction.MSC3973UserDirectorySearch:
                return this.handleUserDirectorySearch(ev.detail)
              case _WidgetApiAction.WidgetApiFromWidgetAction.BeeperReadRoomAccountData:
                return this.handleReadRoomAccountData(ev.detail)
              case _WidgetApiAction.WidgetApiFromWidgetAction.MSC4039GetMediaConfigAction:
                return this.handleGetMediaConfig(ev.detail)
              case _WidgetApiAction.WidgetApiFromWidgetAction.MSC4039UploadFileAction:
                return this.handleUploadFile(ev.detail)
              case _WidgetApiAction.WidgetApiFromWidgetAction.MSC4039DownloadFileAction:
                return this.handleDownloadFile(ev.detail)
              case _WidgetApiAction.WidgetApiFromWidgetAction.MSC4157UpdateDelayedEvent:
                return this.handleUpdateDelayedEvent(ev.detail)
              default:
                return this.transport.reply(ev.detail, {
                  error: {
                    message: `Unknown or unsupported action: ${ ev.detail.action}`,
                  },
                })
            }
          }
        }, 'handleMessage'),
        /**
         * Informs the widget that the client's theme has changed.
         *
         * @param theme The theme data, as an object with arbitrary contents.
         */
      }, {
        key: 'updateTheme',
        value: /* @__PURE__ */ __name(function updateTheme(theme) {
          return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.ThemeChange, theme)
        }, 'updateTheme'),
        /**
         * Informs the widget that the client's language has changed.
         *
         * @param lang The BCP 47 identifier representing the client's current language.
         */
      }, {
        key: 'updateLanguage',
        value: /* @__PURE__ */ __name(function updateLanguage(lang) {
          return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.LanguageChange, {
            lang,
          })
        }, 'updateLanguage'),
        /**
         * Takes a screenshot of the widget.
         *
         * @return Resolves to the widget's screenshot.
         * @throws Throws if there is a problem.
         */
      }, {
        key: 'takeScreenshot',
        value: /* @__PURE__ */ __name(function takeScreenshot() {
          return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.TakeScreenshot, {})
        }, 'takeScreenshot'),
        /**
         * Alerts the widget to whether or not it is currently visible.
         *
         * @param {boolean} isVisible Whether the widget is visible or not.
         * @return {Promise<IWidgetApiResponseData>} Resolves when the widget acknowledges the update.
         */
      }, {
        key: 'updateVisibility',
        value: /* @__PURE__ */ __name(function updateVisibility(isVisible) {
          return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.UpdateVisibility, {
            visible: isVisible,
          })
        }, 'updateVisibility'),
      }, {
        key: 'sendWidgetConfig',
        value: /* @__PURE__ */ __name(function sendWidgetConfig(data) {
          return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.WidgetConfig, data).then()
        }, 'sendWidgetConfig'),
      }, {
        key: 'notifyModalWidgetButtonClicked',
        value: /* @__PURE__ */ __name(function notifyModalWidgetButtonClicked(id) {
          return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.ButtonClicked, {
            id,
          }).then()
        }, 'notifyModalWidgetButtonClicked'),
      }, {
        key: 'notifyModalWidgetClose',
        value: /* @__PURE__ */ __name(function notifyModalWidgetClose(data) {
          return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.CloseModalWidget, data).then()
        }, 'notifyModalWidgetClose'),
        /**
         * Feeds an event to the widget. As a client you are expected to call this
         * for every new event in every room to which you are joined or invited.
         *
         * @param {IRoomEvent} rawEvent The event to (try to) send to the widget.
         * @param {string} currentViewedRoomId The room ID the user is currently
         *   interacting with. Not the room ID of the event.
         * @return {Promise<void>} Resolves when delivered or if the widget is not
         *   able to read the event due to permissions, rejects if the widget failed
         *   to handle the event.
         * @deprecated It is recommended to communicate the viewed room ID by calling
         *   {@link ClientWidgetApi.setViewedRoomId} rather than passing it to this
         *   method.
         */
      }, {
        key: 'feedEvent',
        value: function() {
          const _feedEvent = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee13(rawEvent, currentViewedRoomId) {
            let _rawEvent$content
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee13$(_context13) {
              while (1) {
switch (_context13.prev = _context13.next) {
                  case 0:
                    if (currentViewedRoomId !== void 0) {
this.setViewedRoomId(currentViewedRoomId)
}
                    if (!(rawEvent.room_id !== this.viewedRoomId && !this.canUseRoomTimeline(rawEvent.room_id))) {
                      _context13.next = 3
                      break
                    }
                    return _context13.abrupt('return')
                  case 3:
                    if (!(rawEvent.state_key !== void 0 && rawEvent.state_key !== null)) {
                      _context13.next = 8
                      break
                    }
                    if (this.canReceiveStateEvent(rawEvent.type, rawEvent.state_key)) {
                      _context13.next = 6
                      break
                    }
                    return _context13.abrupt('return')
                  case 6:
                    _context13.next = 10
                    break
                  case 8:
                    if (this.canReceiveRoomEvent(rawEvent.type, (_rawEvent$content = rawEvent.content) === null || _rawEvent$content === void 0 ? void 0 : _rawEvent$content['msgtype'])) {
                      _context13.next = 10
                      break
                    }
                    return _context13.abrupt('return')
                  case 10:
                    _context13.next = 12
                    return this.transport.send(
                      _WidgetApiAction.WidgetApiToWidgetAction.SendEvent,
                      // it's compatible, but missing the index signature
                      rawEvent,
                    )
                  case 12:
                  case 'end':
                    return _context13.stop()
                }
}
            }, '_callee13$'), _callee13, this)
          }, '_callee13')))
          /**
           *
           */
          function feedEvent(_x12, _x13) {
            return _feedEvent.apply(this, arguments)
          }
          __name(feedEvent, 'feedEvent')
          return feedEvent
        }(),
        /**
         * Feeds a to-device event to the widget. As a client you are expected to
         * call this for every to-device event you receive.
         *
         * @param {IRoomEvent} rawEvent The event to (try to) send to the widget.
         * @param {boolean} encrypted Whether the event contents were encrypted.
         * @return {Promise<void>} Resolves when delivered or if the widget is not
         *   able to receive the event due to permissions, rejects if the widget
         *   failed to handle the event.
         */
      }, {
        key: 'feedToDevice',
        value: function() {
          const _feedToDevice = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee14(rawEvent, encrypted) {
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee14$(_context14) {
              while (1) {
switch (_context14.prev = _context14.next) {
                  case 0:
                    if (!this.canReceiveToDeviceEvent(rawEvent.type)) {
                      _context14.next = 3
                      break
                    }
                    _context14.next = 3
                    return this.transport.send(
                      _WidgetApiAction.WidgetApiToWidgetAction.SendToDevice,
                      // it's compatible, but missing the index signature
                      _objectSpread(_objectSpread({}, rawEvent), {}, {
                        encrypted,
                      }),
                    )
                  case 3:
                  case 'end':
                    return _context14.stop()
                }
}
            }, '_callee14$'), _callee14, this)
          }, '_callee14')))
          /**
           *
           */
          function feedToDevice(_x14, _x15) {
            return _feedToDevice.apply(this, arguments)
          }
          __name(feedToDevice, 'feedToDevice')
          return feedToDevice
        }(),
      }, {
        key: 'setViewedRoomId',
        value: (
          /**
           * Indicate that a room is being viewed (making it possible for the widget
           * to interact with it).
           */
          /* @__PURE__ */ __name(function setViewedRoomId(roomId) {
            this.viewedRoomId = roomId
            if (roomId !== null && !this.canUseRoomTimeline(roomId)) {
this.pushRoomState(roomId)
}
          }, 'setViewedRoomId')
        ),
      }, {
        key: 'flushRoomState',
        value: function() {
          const _flushRoomState = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee15() {
            let events; let _iterator6; let _step6; let eventTypeMap; let _iterator7; let _step7; let stateKeyMap
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee15$(_context15) {
              while (1) {
switch (_context15.prev = _context15.next) {
                  case 0:
                    _context15.prev = 0
                  case 1:
                    _context15.next = 3
                    return Promise.all(_toConsumableArray(this.pushRoomStateTasks))
                  case 3:
                    if (this.pushRoomStateTasks.size > 0) {
                      _context15.next = 1
                      break
                    }
                  case 4:
                    events = []
                    _iterator6 = _createForOfIteratorHelper(this.pushRoomStateResult.values())
                    try {
                      for (_iterator6.s(); !(_step6 = _iterator6.n()).done; ) {
                        eventTypeMap = _step6.value
                        _iterator7 = _createForOfIteratorHelper(eventTypeMap.values())
                        try {
                          for (_iterator7.s(); !(_step7 = _iterator7.n()).done; ) {
                            stateKeyMap = _step7.value
                            events.push.apply(events, _toConsumableArray(stateKeyMap.values()))
                          }
                        } catch (err) {
                          _iterator7.e(err)
                        } finally {
                          _iterator7.f()
                        }
                      }
                    } catch (err) {
                      _iterator6.e(err)
                    } finally {
                      _iterator6.f()
                    }
                    _context15.next = 9
                    return this.getWidgetVersions()
                  case 9:
                    if (!_context15.sent.includes(_ApiVersion.UnstableApiVersion.MSC2762_UPDATE_STATE)) {
                      _context15.next = 12
                      break
                    }
                    _context15.next = 12
                    return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.UpdateState, {
                      state: events,
                    })
                  case 12:
                    _context15.prev = 12
                    this.flushRoomStateTask = null
                    return _context15.finish(12)
                  case 15:
                  case 'end':
                    return _context15.stop()
                }
}
            }, '_callee15$'), _callee15, this, [[0, , 12, 15]])
          }, '_callee15')))
          /**
           *
           */
          function flushRoomState() {
            return _flushRoomState.apply(this, arguments)
          }
          __name(flushRoomState, 'flushRoomState')
          return flushRoomState
        }(),
        /**
         * Read the room's state and push all entries that the widget is allowed to
         * read through to the widget.
         */
      }, {
        key: 'pushRoomState',
        value: /* @__PURE__ */ __name(function pushRoomState(roomId) {
          const _this12 = this
          const _iterator8 = _createForOfIteratorHelper(this.allowedEvents); let _step8
          try {
            const _loop = /* @__PURE__ */ __name(function _loop2() {
              const cap = _step8.value
              if (cap.kind === _WidgetEventCapability.EventKind.State && cap.direction === _WidgetEventCapability.EventDirection.Receive) {
                let _cap$keyStr; let _this12$flushRoomStat
                const events = _this12.driver.readRoomState(roomId, cap.eventType, (_cap$keyStr = cap.keyStr) !== null && _cap$keyStr !== void 0 ? _cap$keyStr : void 0)
                var task = events.then(function(events2) {
                  const _iterator9 = _createForOfIteratorHelper(events2); let _step9
                  try {
                    for (_iterator9.s(); !(_step9 = _iterator9.n()).done; ) {
                      const event = _step9.value
                      let eventTypeMap = _this12.pushRoomStateResult.get(roomId)
                      if (eventTypeMap === void 0) {
                        eventTypeMap = /* @__PURE__ */ new Map()
                        _this12.pushRoomStateResult.set(roomId, eventTypeMap)
                      }
                      let stateKeyMap = eventTypeMap.get(cap.eventType)
                      if (stateKeyMap === void 0) {
                        stateKeyMap = /* @__PURE__ */ new Map()
                        eventTypeMap.set(cap.eventType, stateKeyMap)
                      }
                      if (!stateKeyMap.has(event.state_key)) {
stateKeyMap.set(event.state_key, event)
}
                    }
                  } catch (err) {
                    _iterator9.e(err)
                  } finally {
                    _iterator9.f()
                  }
                }, function(e) {
                  return console.error('Failed to read room state for '.concat(roomId, ' (').concat(cap.eventType, ', ').concat(cap.keyStr, ')'), e)
                }).then(function() {
                  _this12.pushRoomStateTasks['delete'](task)
                })
                _this12.pushRoomStateTasks.add(task);
                (_this12$flushRoomStat = _this12.flushRoomStateTask) !== null && _this12$flushRoomStat !== void 0 ? _this12$flushRoomStat : _this12.flushRoomStateTask = _this12.flushRoomState()
                _this12.flushRoomStateTask['catch'](function(e) {
                  return console.error('Failed to push room state', e)
                })
              }
            }, '_loop')
            for (_iterator8.s(); !(_step8 = _iterator8.n()).done; ) {
              _loop()
            }
          } catch (err) {
            _iterator8.e(err)
          } finally {
            _iterator8.f()
          }
        }, 'pushRoomState'),
        /**
         * Feeds a room state update to the widget. As a client you are expected to
         * call this for every state update in every room to which you are joined or
         * invited.
         *
         * @param {IRoomEvent} rawEvent The state event corresponding to the updated
         *   room state entry.
         * @return {Promise<void>} Resolves when delivered or if the widget is not
         *   able to receive the room state due to permissions, rejects if the
         *   widget failed to handle the update.
         */
      }, {
        key: 'feedStateUpdate',
        value: function() {
          const _feedStateUpdate = _asyncToGenerator(/* @__PURE__ */ _regeneratorRuntime().mark(/* @__PURE__ */ __name(function _callee16(rawEvent) {
            let eventTypeMap; let stateKeyMap
            return _regeneratorRuntime().wrap(/* @__PURE__ */ __name(function _callee16$(_context16) {
              while (1) {
switch (_context16.prev = _context16.next) {
                  case 0:
                    if (!(rawEvent.state_key === void 0)) {
                      _context16.next = 2
                      break
                    }
                    throw new Error('Not a state event')
                  case 2:
                    if (!((rawEvent.room_id === this.viewedRoomId || this.canUseRoomTimeline(rawEvent.room_id)) && this.canReceiveStateEvent(rawEvent.type, rawEvent.state_key))) {
                      _context16.next = 21
                      break
                    }
                    if (!(this.pushRoomStateTasks.size === 0)) {
                      _context16.next = 11
                      break
                    }
                    _context16.next = 6
                    return this.getWidgetVersions()
                  case 6:
                    if (!_context16.sent.includes(_ApiVersion.UnstableApiVersion.MSC2762_UPDATE_STATE)) {
                      _context16.next = 9
                      break
                    }
                    _context16.next = 9
                    return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.UpdateState, {
                      state: [rawEvent],
                    })
                  case 9:
                    _context16.next = 21
                    break
                  case 11:
                    eventTypeMap = this.pushRoomStateResult.get(rawEvent.room_id)
                    if (eventTypeMap === void 0) {
                      eventTypeMap = /* @__PURE__ */ new Map()
                      this.pushRoomStateResult.set(rawEvent.room_id, eventTypeMap)
                    }
                    stateKeyMap = eventTypeMap.get(rawEvent.type)
                    if (stateKeyMap === void 0) {
                      stateKeyMap = /* @__PURE__ */ new Map()
                      eventTypeMap.set(rawEvent.type, stateKeyMap)
                    }
                    if (!stateKeyMap.has(rawEvent.type)) {
stateKeyMap.set(rawEvent.state_key, rawEvent)
}
                  case 16:
                    _context16.next = 18
                    return Promise.all(_toConsumableArray(this.pushRoomStateTasks))
                  case 18:
                    if (this.pushRoomStateTasks.size > 0) {
                      _context16.next = 16
                      break
                    }
                  case 19:
                    _context16.next = 21
                    return this.flushRoomStateTask
                  case 21:
                  case 'end':
                    return _context16.stop()
                }
}
            }, '_callee16$'), _callee16, this)
          }, '_callee16')))
          /**
           *
           */
          function feedStateUpdate(_x16) {
            return _feedStateUpdate.apply(this, arguments)
          }
          __name(feedStateUpdate, 'feedStateUpdate')
          return feedStateUpdate
        }(),
      }])
      return ClientWidgetApi3
    }(_events.EventEmitter)
    exports.ClientWidgetApi = ClientWidgetApi2
  },
})

// node_modules/matrix-widget-api/lib/interfaces/IWidgetApiErrorResponse.js
const require_IWidgetApiErrorResponse = __commonJS({
  'node_modules/matrix-widget-api/lib/interfaces/IWidgetApiErrorResponse.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.isErrorResponse = isErrorResponse
    /**
     *
     */
    function _typeof(obj) {
      '@babel/helpers - typeof'
      return _typeof = typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol' ? function(obj2) {
        return typeof obj2
      } : function(obj2) {
        return obj2 && typeof Symbol === 'function' && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? 'symbol' : typeof obj2
      }, _typeof(obj)
    }
    __name(_typeof, '_typeof')
    /**
     *
     */
    function isErrorResponse(responseData) {
      const error = responseData.error
      return _typeof(error) === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
    }
    __name(isErrorResponse, 'isErrorResponse')
  },
})

// node_modules/matrix-widget-api/lib/interfaces/WidgetKind.js
const require_WidgetKind = __commonJS({
  'node_modules/matrix-widget-api/lib/interfaces/WidgetKind.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.WidgetKind = void 0
    const WidgetKind = /* @__PURE__ */ function(WidgetKind2) {
      WidgetKind2['Room'] = 'room'
      WidgetKind2['Account'] = 'account'
      WidgetKind2['Modal'] = 'modal'
      return WidgetKind2
    }({})
    exports.WidgetKind = WidgetKind
  },
})

// node_modules/matrix-widget-api/lib/interfaces/ModalButtonKind.js
const require_ModalButtonKind = __commonJS({
  'node_modules/matrix-widget-api/lib/interfaces/ModalButtonKind.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.ModalButtonKind = void 0
    const ModalButtonKind = /* @__PURE__ */ function(ModalButtonKind2) {
      ModalButtonKind2['Primary'] = 'm.primary'
      ModalButtonKind2['Secondary'] = 'm.secondary'
      ModalButtonKind2['Warning'] = 'm.warning'
      ModalButtonKind2['Danger'] = 'm.danger'
      ModalButtonKind2['Link'] = 'm.link'
      return ModalButtonKind2
    }({})
    exports.ModalButtonKind = ModalButtonKind
  },
})

// node_modules/matrix-widget-api/lib/models/validation/url.js
const require_url = __commonJS({
  'node_modules/matrix-widget-api/lib/models/validation/url.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.isValidUrl = isValidUrl
    /**
     *
     */
    function isValidUrl(val) {
      if (!val) {
return false
}
      try {
        const parsed = new URL(val)
        if (parsed.protocol !== 'http' && parsed.protocol !== 'https') {
          return false
        }
        return true
      } catch (e) {
        if (e instanceof TypeError) {
          return false
        }
        throw e
      }
    }
    __name(isValidUrl, 'isValidUrl')
  },
})

// node_modules/matrix-widget-api/lib/models/validation/utils.js
const require_utils = __commonJS({
  'node_modules/matrix-widget-api/lib/models/validation/utils.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.assertPresent = assertPresent
    /**
     *
     */
    function assertPresent(obj, key) {
      if (!obj[key]) {
        throw new Error(''.concat(String(key), ' is required'))
      }
    }
    __name(assertPresent, 'assertPresent')
  },
})

// node_modules/matrix-widget-api/lib/models/Widget.js
const require_Widget = __commonJS({
  'node_modules/matrix-widget-api/lib/models/Widget.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.Widget = void 0
    const _utils = require_utils()
    const _ = require_lib()
    /**
     *
     */
    function _typeof(obj) {
      '@babel/helpers - typeof'
      return _typeof = typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol' ? function(obj2) {
        return typeof obj2
      } : function(obj2) {
        return obj2 && typeof Symbol === 'function' && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? 'symbol' : typeof obj2
      }, _typeof(obj)
    }
    __name(_typeof, '_typeof')
    /**
     *
     */
    function _classCallCheck(instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError('Cannot call a class as a function')
      }
    }
    __name(_classCallCheck, '_classCallCheck')
    /**
     *
     */
    function _defineProperties(target, props) {
      for (let i = 0; i < props.length; i++) {
        const descriptor = props[i]
        descriptor.enumerable = descriptor.enumerable || false
        descriptor.configurable = true
        if ('value' in descriptor) {
descriptor.writable = true
}
        Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor)
      }
    }
    __name(_defineProperties, '_defineProperties')
    /**
     *
     */
    function _createClass(Constructor, protoProps, staticProps) {
      if (protoProps) {
_defineProperties(Constructor.prototype, protoProps)
}
      if (staticProps) {
_defineProperties(Constructor, staticProps)
}
      Object.defineProperty(Constructor, 'prototype', {writable: false})
      return Constructor
    }
    __name(_createClass, '_createClass')
    /**
     *
     */
    function _toPropertyKey(arg) {
      const key = _toPrimitive(arg, 'string')
      return _typeof(key) === 'symbol' ? key : String(key)
    }
    __name(_toPropertyKey, '_toPropertyKey')
    /**
     *
     */
    function _toPrimitive(input, hint) {
      if (_typeof(input) !== 'object' || input === null) {
return input
}
      const prim = input[Symbol.toPrimitive]
      if (prim !== void 0) {
        const res = prim.call(input, hint || 'default')
        if (_typeof(res) !== 'object') {
return res
}
        throw new TypeError('@@toPrimitive must return a primitive value.')
      }
      return (hint === 'string' ? String : Number)(input)
    }
    __name(_toPrimitive, '_toPrimitive')
    const Widget2 = /* @__PURE__ */ function() {
      /**
       *
       */
      function Widget3(definition) {
        _classCallCheck(this, Widget3)
        this.definition = definition
        if (!this.definition) {
throw new Error('Definition is required')
}
        (0, _utils.assertPresent)(definition, 'id');
        (0, _utils.assertPresent)(definition, 'creatorUserId');
        (0, _utils.assertPresent)(definition, 'type');
        (0, _utils.assertPresent)(definition, 'url')
      }
      __name(Widget3, 'Widget')
      _createClass(Widget3, [{
        key: 'creatorUserId',
        get: /* @__PURE__ */ __name(function get() {
          return this.definition.creatorUserId
        }, 'get'),
        /**
         * The type of widget.
         */
      }, {
        key: 'type',
        get: /* @__PURE__ */ __name(function get() {
          return this.definition.type
        }, 'get'),
        /**
         * The ID of the widget.
         */
      }, {
        key: 'id',
        get: /* @__PURE__ */ __name(function get() {
          return this.definition.id
        }, 'get'),
        /**
         * The name of the widget, or null if not set.
         */
      }, {
        key: 'name',
        get: /* @__PURE__ */ __name(function get() {
          return this.definition.name || null
        }, 'get'),
        /**
         * The title for the widget, or null if not set.
         */
      }, {
        key: 'title',
        get: /* @__PURE__ */ __name(function get() {
          return this.rawData.title || null
        }, 'get'),
        /**
         * The templated URL for the widget.
         */
      }, {
        key: 'templateUrl',
        get: /* @__PURE__ */ __name(function get() {
          return this.definition.url
        }, 'get'),
        /**
         * The origin for this widget.
         */
      }, {
        key: 'origin',
        get: /* @__PURE__ */ __name(function get() {
          return new URL(this.templateUrl).origin
        }, 'get'),
        /**
         * Whether or not the client should wait for the iframe to load. Defaults
         * to true.
         */
      }, {
        key: 'waitForIframeLoad',
        get: /* @__PURE__ */ __name(function get() {
          if (this.definition.waitForIframeLoad === false) {
return false
}
          if (this.definition.waitForIframeLoad === true) {
return true
}
          return true
        }, 'get'),
        /**
         * The raw data for the widget. This will always be defined, though
         * may be empty.
         */
      }, {
        key: 'rawData',
        get: /* @__PURE__ */ __name(function get() {
          return this.definition.data || {}
        }, 'get'),
        /**
         * Gets a complete widget URL for the client to render.
         *
         * @param {ITemplateParams} params The template parameters.
         * @return {string} A templated URL.
         */
      }, {
        key: 'getCompleteUrl',
        value: /* @__PURE__ */ __name(function getCompleteUrl(params) {
          return (0, _.runTemplate)(this.templateUrl, this.definition, params)
        }, 'getCompleteUrl'),
      }])
      return Widget3
    }()
    exports.Widget = Widget2
  },
})

// node_modules/matrix-widget-api/lib/models/WidgetParser.js
const require_WidgetParser = __commonJS({
  'node_modules/matrix-widget-api/lib/models/WidgetParser.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.WidgetParser = void 0
    const _Widget = require_Widget()
    const _url = require_url()
    /**
     *
     */
    function _typeof(obj) {
      '@babel/helpers - typeof'
      return _typeof = typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol' ? function(obj2) {
        return typeof obj2
      } : function(obj2) {
        return obj2 && typeof Symbol === 'function' && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? 'symbol' : typeof obj2
      }, _typeof(obj)
    }
    __name(_typeof, '_typeof')
    /**
     *
     */
    function _createForOfIteratorHelper(o, allowArrayLike) {
      let it = typeof Symbol !== 'undefined' && o[Symbol.iterator] || o['@@iterator']
      if (!it) {
        if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === 'number') {
          if (it) {
o = it
}
          let i = 0
          const F = /* @__PURE__ */ __name(function F2() {
          }, 'F')
          return {s: F, n: /* @__PURE__ */ __name(function n() {
            if (i >= o.length) {
return {done: true}
}
            return {done: false, value: o[i++]}
          }, 'n'), e: /* @__PURE__ */ __name(function e(_e) {
            throw _e
          }, 'e'), f: F}
        }
        throw new TypeError('Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.')
      }
      let normalCompletion = true; let didErr = false; let err
      return {s: /* @__PURE__ */ __name(function s() {
        it = it.call(o)
      }, 's'), n: /* @__PURE__ */ __name(function n() {
        const step = it.next()
        normalCompletion = step.done
        return step
      }, 'n'), e: /* @__PURE__ */ __name(function e(_e2) {
        didErr = true
        err = _e2
      }, 'e'), f: /* @__PURE__ */ __name(function f() {
        try {
          if (!normalCompletion && it['return'] != null) {
it['return']()
}
        } finally {
          if (didErr) {
throw err
}
        }
      }, 'f')}
    }
    __name(_createForOfIteratorHelper, '_createForOfIteratorHelper')
    /**
     *
     */
    function _unsupportedIterableToArray(o, minLen) {
      if (!o) {
return
}
      if (typeof o === 'string') {
return _arrayLikeToArray(o, minLen)
}
      let n = Object.prototype.toString.call(o).slice(8, -1)
      if (n === 'Object' && o.constructor) {
n = o.constructor.name
}
      if (n === 'Map' || n === 'Set') {
return Array.from(o)
}
      if (n === 'Arguments' || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) {
return _arrayLikeToArray(o, minLen)
}
    }
    __name(_unsupportedIterableToArray, '_unsupportedIterableToArray')
    /**
     *
     */
    function _arrayLikeToArray(arr, len) {
      if (len == null || len > arr.length) {
len = arr.length
}
      for (var i = 0, arr2 = new Array(len); i < len; i++) {
arr2[i] = arr[i]
}
      return arr2
    }
    __name(_arrayLikeToArray, '_arrayLikeToArray')
    /**
     *
     */
    function _classCallCheck(instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError('Cannot call a class as a function')
      }
    }
    __name(_classCallCheck, '_classCallCheck')
    /**
     *
     */
    function _defineProperties(target, props) {
      for (let i = 0; i < props.length; i++) {
        const descriptor = props[i]
        descriptor.enumerable = descriptor.enumerable || false
        descriptor.configurable = true
        if ('value' in descriptor) {
descriptor.writable = true
}
        Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor)
      }
    }
    __name(_defineProperties, '_defineProperties')
    /**
     *
     */
    function _createClass(Constructor, protoProps, staticProps) {
      if (protoProps) {
_defineProperties(Constructor.prototype, protoProps)
}
      if (staticProps) {
_defineProperties(Constructor, staticProps)
}
      Object.defineProperty(Constructor, 'prototype', {writable: false})
      return Constructor
    }
    __name(_createClass, '_createClass')
    /**
     *
     */
    function _toPropertyKey(arg) {
      const key = _toPrimitive(arg, 'string')
      return _typeof(key) === 'symbol' ? key : String(key)
    }
    __name(_toPropertyKey, '_toPropertyKey')
    /**
     *
     */
    function _toPrimitive(input, hint) {
      if (_typeof(input) !== 'object' || input === null) {
return input
}
      const prim = input[Symbol.toPrimitive]
      if (prim !== void 0) {
        const res = prim.call(input, hint || 'default')
        if (_typeof(res) !== 'object') {
return res
}
        throw new TypeError('@@toPrimitive must return a primitive value.')
      }
      return (hint === 'string' ? String : Number)(input)
    }
    __name(_toPrimitive, '_toPrimitive')
    const WidgetParser = /* @__PURE__ */ function() {
      /**
       *
       */
      function WidgetParser2() {
        _classCallCheck(this, WidgetParser2)
      }
      __name(WidgetParser2, 'WidgetParser')
      _createClass(WidgetParser2, null, [{
        key: 'parseAccountData',
        value: /* @__PURE__ */ __name(function parseAccountData(content) {
          if (!content) {
return []
}
          const result = []
          for (let _i = 0, _Object$keys = Object.keys(content); _i < _Object$keys.length; _i++) {
            const _widgetId = _Object$keys[_i]
            const roughWidget = content[_widgetId]
            if (!roughWidget) {
continue
}
            if (roughWidget.type !== 'm.widget' && roughWidget.type !== 'im.vector.modular.widgets') {
continue
}
            if (!roughWidget.sender) {
continue
}
            const probableWidgetId = roughWidget.state_key || roughWidget.id
            if (probableWidgetId !== _widgetId) {
continue
}
            const asStateEvent = {
              content: roughWidget.content,
              sender: roughWidget.sender,
              type: 'm.widget',
              state_key: _widgetId,
              event_id: '$example',
              room_id: '!example',
              origin_server_ts: 1,
            }
            const widget = WidgetParser2.parseRoomWidget(asStateEvent)
            if (widget) {
result.push(widget)
}
          }
          return result
        }, 'parseAccountData'),
        /**
         * Parses all the widgets possible in the given array. This will always return
         * an array, though may be empty if no widgets could be parsed.
         *
         * @param {IStateEvent[]} currentState The room state to parse.
         * @return {Widget[]} The widgets in the state, or an empty array.
         */
      }, {
        key: 'parseWidgetsFromRoomState',
        value: /* @__PURE__ */ __name(function parseWidgetsFromRoomState(currentState) {
          if (!currentState) {
return []
}
          const result = []
          const _iterator = _createForOfIteratorHelper(currentState); let _step
          try {
            for (_iterator.s(); !(_step = _iterator.n()).done; ) {
              const state = _step.value
              const widget = WidgetParser2.parseRoomWidget(state)
              if (widget) {
result.push(widget)
}
            }
          } catch (err) {
            _iterator.e(err)
          } finally {
            _iterator.f()
          }
          return result
        }, 'parseWidgetsFromRoomState'),
        /**
         * Parses a state event into a widget. If the state event does not represent
         * a widget (wrong event type, invalid widget, etc) then null is returned.
         *
         * @param {IStateEvent} stateEvent The state event.
         * @return {Widget|null} The widget, or null if invalid
         */
      }, {
        key: 'parseRoomWidget',
        value: /* @__PURE__ */ __name(function parseRoomWidget(stateEvent) {
          if (!stateEvent) {
return null
}
          if (stateEvent.type !== 'm.widget' && stateEvent.type !== 'im.vector.modular.widgets') {
            return null
          }
          const content = stateEvent.content || {}
          const estimatedWidget = {
            id: stateEvent.state_key,
            creatorUserId: content['creatorUserId'] || stateEvent.sender,
            name: content['name'],
            type: content['type'],
            url: content['url'],
            waitForIframeLoad: content['waitForIframeLoad'],
            data: content['data'],
          }
          return WidgetParser2.processEstimatedWidget(estimatedWidget)
        }, 'parseRoomWidget'),
      }, {
        key: 'processEstimatedWidget',
        value: /* @__PURE__ */ __name(function processEstimatedWidget(widget) {
          if (!widget.id || !widget.creatorUserId || !widget.type) {
            return null
          }
          if (!(0, _url.isValidUrl)(widget.url)) {
            return null
          }
          return new _Widget.Widget(widget)
        }, 'processEstimatedWidget'),
      }])
      return WidgetParser2
    }()
    exports.WidgetParser = WidgetParser
  },
})

// node_modules/matrix-widget-api/lib/templating/url-template.js
const require_url_template = __commonJS({
  'node_modules/matrix-widget-api/lib/templating/url-template.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.runTemplate = runTemplate
    exports.toString = toString
    /**
     *
     */
    function runTemplate(url, widget, params) {
      const variables = Object.assign({}, widget.data, {
        'matrix_room_id': params.widgetRoomId || '',
        'matrix_user_id': params.currentUserId,
        'matrix_display_name': params.userDisplayName || params.currentUserId,
        'matrix_avatar_url': params.userHttpAvatarUrl || '',
        'matrix_widget_id': widget.id,
        // TODO: Convert to stable (https://github.com/matrix-org/matrix-doc/pull/2873)
        'org.matrix.msc2873.client_id': params.clientId || '',
        'org.matrix.msc2873.client_theme': params.clientTheme || '',
        'org.matrix.msc2873.client_language': params.clientLanguage || '',
        // TODO: Convert to stable (https://github.com/matrix-org/matrix-spec-proposals/pull/3819)
        'org.matrix.msc3819.matrix_device_id': params.deviceId || '',
        // TODO: Convert to stable (https://github.com/matrix-org/matrix-spec-proposals/pull/4039)
        'org.matrix.msc4039.matrix_base_url': params.baseUrl || '',
      })
      let result = url
      for (let _i = 0, _Object$keys = Object.keys(variables); _i < _Object$keys.length; _i++) {
        const key = _Object$keys[_i]
        const pattern = '$'.concat(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const rexp = new RegExp(pattern, 'g')
        result = result.replace(rexp, encodeURIComponent(toString(variables[key])))
      }
      return result
    }
    __name(runTemplate, 'runTemplate')
    /**
     *
     */
    function toString(a) {
      if (a === null || a === void 0) {
        return ''.concat(a)
      }
      return String(a)
    }
    __name(toString, 'toString')
  },
})

// node_modules/matrix-widget-api/lib/driver/WidgetDriver.js
const require_WidgetDriver = __commonJS({
  'node_modules/matrix-widget-api/lib/driver/WidgetDriver.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    exports.WidgetDriver = void 0
    const _ = require_lib()
    /**
     *
     */
    function _typeof(obj) {
      '@babel/helpers - typeof'
      return _typeof = typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol' ? function(obj2) {
        return typeof obj2
      } : function(obj2) {
        return obj2 && typeof Symbol === 'function' && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? 'symbol' : typeof obj2
      }, _typeof(obj)
    }
    __name(_typeof, '_typeof')
    /**
     *
     */
    function _classCallCheck(instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError('Cannot call a class as a function')
      }
    }
    __name(_classCallCheck, '_classCallCheck')
    /**
     *
     */
    function _defineProperties(target, props) {
      for (let i = 0; i < props.length; i++) {
        const descriptor = props[i]
        descriptor.enumerable = descriptor.enumerable || false
        descriptor.configurable = true
        if ('value' in descriptor) {
descriptor.writable = true
}
        Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor)
      }
    }
    __name(_defineProperties, '_defineProperties')
    /**
     *
     */
    function _createClass(Constructor, protoProps, staticProps) {
      if (protoProps) {
_defineProperties(Constructor.prototype, protoProps)
}
      if (staticProps) {
_defineProperties(Constructor, staticProps)
}
      Object.defineProperty(Constructor, 'prototype', {writable: false})
      return Constructor
    }
    __name(_createClass, '_createClass')
    /**
     *
     */
    function _toPropertyKey(arg) {
      const key = _toPrimitive(arg, 'string')
      return _typeof(key) === 'symbol' ? key : String(key)
    }
    __name(_toPropertyKey, '_toPropertyKey')
    /**
     *
     */
    function _toPrimitive(input, hint) {
      if (_typeof(input) !== 'object' || input === null) {
return input
}
      const prim = input[Symbol.toPrimitive]
      if (prim !== void 0) {
        const res = prim.call(input, hint || 'default')
        if (_typeof(res) !== 'object') {
return res
}
        throw new TypeError('@@toPrimitive must return a primitive value.')
      }
      return (hint === 'string' ? String : Number)(input)
    }
    __name(_toPrimitive, '_toPrimitive')
    const WidgetDriver = /* @__PURE__ */ function() {
      /**
       *
       */
      function WidgetDriver2() {
        _classCallCheck(this, WidgetDriver2)
      }
      __name(WidgetDriver2, 'WidgetDriver')
      _createClass(WidgetDriver2, [{
        key: 'validateCapabilities',
        value: (
          /**
           * Verifies the widget's requested capabilities, returning the ones
           * it is approved to use. Mutating the requested capabilities will
           * have no effect.
           *
           * This SHOULD result in the user being prompted to approve/deny
           * capabilities.
           *
           * By default this rejects all capabilities (returns an empty set).
           *
           * @param {Set<Capability>} requested The set of requested capabilities.
           * @return {Promise<Set<Capability>>} Resolves to the allowed capabilities.
           */
          /* @__PURE__ */ __name(function validateCapabilities(requested) {
            return Promise.resolve(/* @__PURE__ */ new Set())
          }, 'validateCapabilities')
        ),
        /**
         * Sends an event into a room. If `roomId` is falsy, the client should send the event
         * into the room the user is currently looking at. The widget API will have already
         * verified that the widget is capable of sending the event to that room.
         *
         * @param {string} eventType The event type to be sent.
         * @param {*} content The content for the event.
         * @param {string|null} stateKey The state key if this is a state event, otherwise null.
         * May be an empty string.
         * @param {string|null} roomId The room ID to send the event to. If falsy, the room the
         * user is currently looking at.
         * @return {Promise<ISendEventDetails>} Resolves when the event has been sent with
         * details of that event.
         * @throws Rejected when the event could not be sent.
         */
      }, {
        key: 'sendEvent',
        value: /* @__PURE__ */ __name(function sendEvent(eventType, content) {
          const stateKey = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : null
          const roomId = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : null
          return Promise.reject(new Error('Failed to override function'))
        }, 'sendEvent'),
        /**
         * @experimental Part of MSC4140 & MSC4157
         * Sends a delayed event into a room. If `roomId` is falsy, the client should send it
         * into the room the user is currently looking at. The widget API will have already
         * verified that the widget is capable of sending the event to that room.
         * @param {number|null} delay How much later to send the event, or null to not send the
         * event automatically. May not be null if {@link parentDelayId} is null.
         * @param {string|null} parentDelayId The ID of the delayed event this one is grouped with,
         * or null if it will be put in a new group. May not be null if {@link delay} is null.
         * @param {string} eventType The event type of the event to be sent.
         * @param {*} content The content for the event to be sent.
         * @param {string|null} stateKey The state key if the event to be sent a state event,
         * otherwise null. May be an empty string.
         * @param {string|null} roomId The room ID to send the event to. If falsy, the room the
         * user is currently looking at.
         * @return {Promise<ISendDelayedEventDetails>} Resolves when the delayed event has been
         * prepared with details of how to refer to it for updating/sending/canceling it later.
         * @throws Rejected when the delayed event could not be sent.
         */
      }, {
        key: 'sendDelayedEvent',
        value: /* @__PURE__ */ __name(function sendDelayedEvent(delay, parentDelayId, eventType, content) {
          const stateKey = arguments.length > 4 && arguments[4] !== void 0 ? arguments[4] : null
          const roomId = arguments.length > 5 && arguments[5] !== void 0 ? arguments[5] : null
          return Promise.reject(new Error('Failed to override function'))
        }, 'sendDelayedEvent'),
        /**
         * @experimental Part of MSC4140 & MSC4157
         * Run the specified {@link action} for the delayed event matching the provided {@link delayId}.
         * @throws Rejected when there is no matching delayed event, or when the action failed to run.
         */
      }, {
        key: 'updateDelayedEvent',
        value: /* @__PURE__ */ __name(function updateDelayedEvent(delayId, action) {
          return Promise.reject(new Error('Failed to override function'))
        }, 'updateDelayedEvent'),
        /**
         * Sends a to-device event. The widget API will have already verified that the widget
         * is capable of sending the event.
         *
         * @param {string} eventType The event type to be sent.
         * @param {boolean} encrypted Whether to encrypt the message contents.
         * @param {object} contentMap A map from user ID and device ID to event content.
         * @return {Promise<void>} Resolves when the event has been sent.
         * @throws Rejected when the event could not be sent.
         */
      }, {
        key: 'sendToDevice',
        value: /* @__PURE__ */ __name(function sendToDevice(eventType, encrypted, contentMap) {
          return Promise.reject(new Error('Failed to override function'))
        }, 'sendToDevice'),
        /**
         * Reads an element of room account data. The widget API will have already verified that the widget is
         * capable of receiving the `eventType` of the requested information. If `roomIds` is supplied, it may
         * contain `Symbols.AnyRoom` to denote that the piece of room account data in each of the client's known
         * rooms should be returned. When `null`, only the room the user is currently looking at should be considered.
         *
         * @param eventType The event type to be read.
         * @param roomIds When null, the user's currently viewed room. Otherwise, the list of room IDs
         * to look within, possibly containing Symbols.AnyRoom to denote all known rooms.
         * @return {Promise<IRoomAccountData[]>} Resolves to the element of room account data, or an empty array.
         */
      }, {
        key: 'readRoomAccountData',
        value: /* @__PURE__ */ __name(function readRoomAccountData(eventType) {
          const roomIds = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : null
          return Promise.resolve([])
        }, 'readRoomAccountData'),
        /**
         * Reads all events of the given type, and optionally `msgtype` (if applicable/defined),
         * the user has access to. The widget API will have already verified that the widget is
         * capable of receiving the events. Less events than the limit are allowed to be returned,
         * but not more. If `roomIds` is supplied, it may contain `Symbols.AnyRoom` to denote that
         * `limit` in each of the client's known rooms should be returned. When `null`, only the
         * room the user is currently looking at should be considered. If `since` is specified but
         * the event ID isn't present in the number of events fetched by the client due to `limit`,
         * the client will return all the events.
         *
         * @param eventType The event type to be read.
         * @param msgtype The msgtype of the events to be read, if applicable/defined.
         * @param stateKey The state key of the events to be read, if applicable/defined.
         * @param limit The maximum number of events to retrieve per room. Will be zero to denote "as many
         * as possible".
         * @param roomIds When null, the user's currently viewed room. Otherwise, the list of room IDs
         * to look within, possibly containing Symbols.AnyRoom to denote all known rooms.
         * @param since When null, retrieves the number of events specified by the "limit" parameter.
         * Otherwise, the event ID at which only subsequent events will be returned, as many as specified
         * in "limit".
         * @return {Promise<IRoomEvent[]>} Resolves to the room events, or an empty array.
         * @deprecated Clients are advised to implement {@link WidgetDriver.readRoomTimeline} instead.
         */
      }, {
        key: 'readRoomEvents',
        value: /* @__PURE__ */ __name(function readRoomEvents(eventType, msgtype, limit) {
          const roomIds = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : null
          const since = arguments.length > 4 ? arguments[4] : void 0
          return Promise.resolve([])
        }, 'readRoomEvents'),
        /**
         * Reads all events of the given type, and optionally state key (if applicable/defined),
         * the user has access to. The widget API will have already verified that the widget is
         * capable of receiving the events. Less events than the limit are allowed to be returned,
         * but not more. If `roomIds` is supplied, it may contain `Symbols.AnyRoom` to denote that
         * `limit` in each of the client's known rooms should be returned. When `null`, only the
         * room the user is currently looking at should be considered.
         *
         * @param eventType The event type to be read.
         * @param stateKey The state key of the events to be read, if applicable/defined.
         * @param limit The maximum number of events to retrieve. Will be zero to denote "as many
         * as possible".
         * @param roomIds When null, the user's currently viewed room. Otherwise, the list of room IDs
         * to look within, possibly containing Symbols.AnyRoom to denote all known rooms.
         * @return {Promise<IRoomEvent[]>} Resolves to the state events, or an empty array.
         * @deprecated Clients are advised to implement {@link WidgetDriver.readRoomTimeline} instead.
         */
      }, {
        key: 'readStateEvents',
        value: /* @__PURE__ */ __name(function readStateEvents(eventType, stateKey, limit) {
          const roomIds = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : null
          return Promise.resolve([])
        }, 'readStateEvents'),
        /**
         * Reads all events of the given type, and optionally `msgtype` (if applicable/defined),
         * the user has access to. The widget API will have already verified that the widget is
         * capable of receiving the events. Less events than the limit are allowed to be returned,
         * but not more.
         *
         * @param roomId The ID of the room to look within.
         * @param eventType The event type to be read.
         * @param msgtype The msgtype of the events to be read, if applicable/defined.
         * @param stateKey The state key of the events to be read, if applicable/defined.
         * @param limit The maximum number of events to retrieve. Will be zero to denote "as many as
         * possible".
         * @param since When null, retrieves the number of events specified by the "limit" parameter.
         * Otherwise, the event ID at which only subsequent events will be returned, as many as specified
         * in "limit".
         * @return {Promise<IRoomEvent[]>} Resolves to the room events, or an empty array.
         */
      }, {
        key: 'readRoomTimeline',
        value: /* @__PURE__ */ __name(function readRoomTimeline(roomId, eventType, msgtype, stateKey, limit, since) {
          if (stateKey === void 0) {
return this.readRoomEvents(eventType, msgtype, limit, [roomId], since)
} else {
return this.readStateEvents(eventType, stateKey, limit, [roomId])
}
        }, 'readRoomTimeline'),
        /**
         * Reads the current values of all matching room state entries.
         *
         * @param roomId The ID of the room.
         * @param eventType The event type of the entries to be read.
         * @param stateKey The state key of the entry to be read. If undefined,
         * all room state entries with a matching event type should be returned.
         * @return {Promise<IRoomEvent[]>} Resolves to the events representing the
         * current values of the room state entries.
         */
      }, {
        key: 'readRoomState',
        value: /* @__PURE__ */ __name(function readRoomState(roomId, eventType, stateKey) {
          return this.readStateEvents(eventType, stateKey, Number.MAX_SAFE_INTEGER, [roomId])
        }, 'readRoomState'),
        /**
         * Reads all events that are related to a given event. The widget API will
         * have already verified that the widget is capable of receiving the event,
         * or will make sure to reject access to events which are returned from this
         * function, but are not capable of receiving. If `relationType` or `eventType`
         * are set, the returned events should already be filtered. Less events than
         * the limit are allowed to be returned, but not more.
         *
         * @param eventId The id of the parent event to be read.
         * @param roomId The room to look within. When undefined, the user's
         * currently viewed room.
         * @param relationType The relationship type of child events to search for.
         * When undefined, all relations are returned.
         * @param eventType The event type of child events to search for. When undefined,
         * all related events are returned.
         * @param from The pagination token to start returning results from, as
         * received from a previous call. If not supplied, results start at the most
         * recent topological event known to the server.
         * @param to The pagination token to stop returning results at. If not
         * supplied, results continue up to limit or until there are no more events.
         * @param limit The maximum number of events to retrieve per room. If not
         * supplied, the server will apply a default limit.
         * @param direction The direction to search for according to MSC3715
         * @return Resolves to the room relations.
         */
      }, {
        key: 'readEventRelations',
        value: /* @__PURE__ */ __name(function readEventRelations(eventId, roomId, relationType, eventType, from, to, limit, direction) {
          return Promise.resolve({
            chunk: [],
          })
        }, 'readEventRelations'),
        /**
         * Asks the user for permission to validate their identity through OpenID Connect. The
         * interface for this function is an observable which accepts the state machine of the
         * OIDC exchange flow. For example, if the client/user blocks the request then it would
         * feed back a `{state: Blocked}` into the observable. Similarly, if the user already
         * approved the widget then a `{state: Allowed}` would be fed into the observable alongside
         * the token itself. If the client is asking for permission, it should feed in a
         * `{state: PendingUserConfirmation}` followed by the relevant Allowed or Blocked state.
         *
         * The widget API will reject the widget's request with an error if this contract is not
         * met properly. By default, the widget driver will block all OIDC requests.
         *
         * @param {SimpleObservable<IOpenIDUpdate>} observer The observable to feed updates into.
         */
      }, {
        key: 'askOpenID',
        value: /* @__PURE__ */ __name(function askOpenID(observer) {
          observer.update({
            state: _.OpenIDRequestState.Blocked,
          })
        }, 'askOpenID'),
        /**
         * Navigates the client with a matrix.to URI. In future this function will also be provided
         * with the Matrix URIs once matrix.to is replaced. The given URI will have already been
         * lightly checked to ensure it looks like a valid URI, though the implementation is recommended
         * to do further checks on the URI.
         *
         * @param {string} uri The URI to navigate to.
         * @return {Promise<void>} Resolves when complete.
         * @throws Throws if there's a problem with the navigation, such as invalid format.
         */
      }, {
        key: 'navigate',
        value: /* @__PURE__ */ __name(function navigate(uri) {
          throw new Error('Navigation is not implemented')
        }, 'navigate'),
        /**
         * Polls for TURN server data, yielding an initial set of credentials as soon as possible, and
         * thereafter yielding new credentials whenever the previous ones expire. The widget API will
         * have already verified that the widget has permission to access TURN servers.
         *
         * @yields {ITurnServer} The TURN server URIs and credentials currently available to the client.
         */
      }, {
        key: 'getTurnServers',
        value: /* @__PURE__ */ __name(function getTurnServers() {
          throw new Error('TURN server support is not implemented')
        }, 'getTurnServers'),
        /**
         * Search for users in the user directory.
         *
         * @param searchTerm The term to search for.
         * @param limit The maximum number of results to return. If not supplied, the
         * @return Resolves to the search results.
         */
      }, {
        key: 'searchUserDirectory',
        value: /* @__PURE__ */ __name(function searchUserDirectory(searchTerm, limit) {
          return Promise.resolve({
            limited: false,
            results: [],
          })
        }, 'searchUserDirectory'),
        /**
         * Get the config for the media repository.
         *
         * @return Promise which resolves with an object containing the config.
         */
      }, {
        key: 'getMediaConfig',
        value: /* @__PURE__ */ __name(function getMediaConfig() {
          throw new Error('Get media config is not implemented')
        }, 'getMediaConfig'),
        /**
         * Upload a file to the media repository on the homeserver.
         *
         * @param file - The object to upload. Something that can be sent to
         *               XMLHttpRequest.send (typically a File).
         * @return Resolves to the location of the uploaded file.
         */
      }, {
        key: 'uploadFile',
        value: /* @__PURE__ */ __name(function uploadFile(file) {
          throw new Error('Upload file is not implemented')
        }, 'uploadFile'),
        /**
         * Download a file from the media repository on the homeserver.
         *
         * @param contentUri - MXC URI of the file to download.
         * @return Resolves to the contents of the file.
         */
      }, {
        key: 'downloadFile',
        value: /* @__PURE__ */ __name(function downloadFile(contentUri) {
          throw new Error('Download file is not implemented')
        }, 'downloadFile'),
        /**
         * Gets the IDs of all joined or invited rooms currently known to the
         * client.
         *
         * @return The room IDs.
         */
      }, {
        key: 'getKnownRooms',
        value: /* @__PURE__ */ __name(function getKnownRooms() {
          throw new Error('Querying known rooms is not implemented')
        }, 'getKnownRooms'),
        /**
         * Expresses an error thrown by this driver in a format compatible with the Widget API.
         *
         * @param error The error to handle.
         * @return The error expressed as a {@link IWidgetApiErrorResponseDataDetails},
         * or undefined if it cannot be expressed as one.
         */
      }, {
        key: 'processError',
        value: /* @__PURE__ */ __name(function processError(error) {
          return void 0
        }, 'processError'),
      }])
      return WidgetDriver2
    }()
    exports.WidgetDriver = WidgetDriver
  },
})

// node_modules/matrix-widget-api/lib/index.js
var require_lib = __commonJS({
  'node_modules/matrix-widget-api/lib/index.js'(exports) {
    'use strict'
    Object.defineProperty(exports, '__esModule', {
      value: true,
    })
    const _WidgetApi = require_WidgetApi()
    Object.keys(_WidgetApi).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _WidgetApi[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _WidgetApi[key]
        }, 'get'),
      })
    })
    const _ClientWidgetApi = require_ClientWidgetApi()
    Object.keys(_ClientWidgetApi).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _ClientWidgetApi[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _ClientWidgetApi[key]
        }, 'get'),
      })
    })
    const _Symbols = require_Symbols()
    Object.keys(_Symbols).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _Symbols[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _Symbols[key]
        }, 'get'),
      })
    })
    const _PostmessageTransport = require_PostmessageTransport()
    Object.keys(_PostmessageTransport).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _PostmessageTransport[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _PostmessageTransport[key]
        }, 'get'),
      })
    })
    const _WidgetType = require_WidgetType()
    Object.keys(_WidgetType).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _WidgetType[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _WidgetType[key]
        }, 'get'),
      })
    })
    const _IWidgetApiErrorResponse = require_IWidgetApiErrorResponse()
    Object.keys(_IWidgetApiErrorResponse).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _IWidgetApiErrorResponse[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _IWidgetApiErrorResponse[key]
        }, 'get'),
      })
    })
    const _WidgetApiAction = require_WidgetApiAction()
    Object.keys(_WidgetApiAction).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _WidgetApiAction[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _WidgetApiAction[key]
        }, 'get'),
      })
    })
    const _WidgetApiDirection = require_WidgetApiDirection()
    Object.keys(_WidgetApiDirection).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _WidgetApiDirection[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _WidgetApiDirection[key]
        }, 'get'),
      })
    })
    const _ApiVersion = require_ApiVersion()
    Object.keys(_ApiVersion).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _ApiVersion[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _ApiVersion[key]
        }, 'get'),
      })
    })
    const _Capabilities = require_Capabilities()
    Object.keys(_Capabilities).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _Capabilities[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _Capabilities[key]
        }, 'get'),
      })
    })
    const _GetOpenIDAction = require_GetOpenIDAction()
    Object.keys(_GetOpenIDAction).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _GetOpenIDAction[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _GetOpenIDAction[key]
        }, 'get'),
      })
    })
    const _WidgetKind = require_WidgetKind()
    Object.keys(_WidgetKind).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _WidgetKind[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _WidgetKind[key]
        }, 'get'),
      })
    })
    const _ModalButtonKind = require_ModalButtonKind()
    Object.keys(_ModalButtonKind).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _ModalButtonKind[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _ModalButtonKind[key]
        }, 'get'),
      })
    })
    const _ModalWidgetActions = require_ModalWidgetActions()
    Object.keys(_ModalWidgetActions).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _ModalWidgetActions[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _ModalWidgetActions[key]
        }, 'get'),
      })
    })
    const _UpdateDelayedEventAction = require_UpdateDelayedEventAction()
    Object.keys(_UpdateDelayedEventAction).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _UpdateDelayedEventAction[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _UpdateDelayedEventAction[key]
        }, 'get'),
      })
    })
    const _WidgetEventCapability = require_WidgetEventCapability()
    Object.keys(_WidgetEventCapability).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _WidgetEventCapability[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _WidgetEventCapability[key]
        }, 'get'),
      })
    })
    const _url = require_url()
    Object.keys(_url).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _url[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _url[key]
        }, 'get'),
      })
    })
    const _utils = require_utils()
    Object.keys(_utils).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _utils[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _utils[key]
        }, 'get'),
      })
    })
    const _Widget = require_Widget()
    Object.keys(_Widget).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _Widget[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _Widget[key]
        }, 'get'),
      })
    })
    const _WidgetParser = require_WidgetParser()
    Object.keys(_WidgetParser).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _WidgetParser[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _WidgetParser[key]
        }, 'get'),
      })
    })
    const _urlTemplate = require_url_template()
    Object.keys(_urlTemplate).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _urlTemplate[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _urlTemplate[key]
        }, 'get'),
      })
    })
    const _SimpleObservable = require_SimpleObservable()
    Object.keys(_SimpleObservable).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _SimpleObservable[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _SimpleObservable[key]
        }, 'get'),
      })
    })
    const _WidgetDriver = require_WidgetDriver()
    Object.keys(_WidgetDriver).forEach(function(key) {
      if (key === 'default' || key === '__esModule') {
return
}
      if (key in exports && exports[key] === _WidgetDriver[key]) {
return
}
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: /* @__PURE__ */ __name(function get() {
          return _WidgetDriver[key]
        }, 'get'),
      })
    })
  },
})

// src/tests/fixtures/bldrs-inside-iframe.js
const mxwidgets = __toESM(require_lib())
console.log('mxwidgets:', mxwidgets)
const _BldrsWidget = class _BldrsWidget {
  constructor() {
    __publicField(this, 'creatorUserId', 'ai.bldrs-share')
    __publicField(this, 'id', 'bldrs-share')
    __publicField(this, 'type', 'm.custom')
    __publicField(this, 'url', null)
    __publicField(this, 'waitForIframeLoad', false)
  }
}
__name(_BldrsWidget, 'BldrsWidget')
const BldrsWidget = _BldrsWidget
const _BldrsWidgetDriver = class _BldrsWidgetDriver {
  /** */
  askOpenID(observer) {
  }
  /** @return {undefined} */
  getTurnServers() {
    return void 0
  }
  /** @return {Promise} */
  navigate(uri) {
    return Promise.resolve(void 0)
  }
  // NOSONAR
  /**
   * @return {Promise}
   */
  readEventRelations(eventId, roomId, relationType, eventType, from, to, limit, direction) {
    return Promise.resolve(void 0)
  }
  /** @return {Promise} */
  readRoomEvents(eventType, msgtype, limit, roomIds) {
    return Promise.resolve([])
  }
  /** @return {Promise} */
  readStateEvents(eventType, stateKey, limit, roomIds) {
    return Promise.resolve([])
  }
  /** @return {Promise} */
  sendEvent(eventType, content, stateKey, roomId) {
    return Promise.resolve(void 0)
  }
  /** @return {Promise} */
  sendToDevice(eventType, encrypted, contentMap) {
    return Promise.resolve(void 0)
  }
  /** @return {Promise} */
  validateCapabilities(requested) {
    return Promise.resolve(requested)
  }
}
__name(_BldrsWidgetDriver, 'BldrsWidgetDriver')
const BldrsWidgetDriver = _BldrsWidgetDriver
const EVENT_CLIENT_SELECTIONCHANGED_ELEMENTS = 'ai.bldrs-share.SelectionChanged'
const EVENT_CLIENT_MODEL_LOADED = 'ai.bldrs-share.ModelLoaded'
const EVENT_CLIENT_HIDDEN_ELEMENTS = 'ai.bldrs-share.HiddenElements'
document.addEventListener('DOMContentLoaded', (domEvent) => {
  const container = document.getElementById('bldrs-widget-iframe')
  const bldrsWidget = new BldrsWidget()
  bldrsWidget.url = ''.concat(location.protocol, '//').concat(location.host)
  const widget = new mxwidgets.Widget(bldrsWidget)
  const driver = new BldrsWidgetDriver()
  const api = new mxwidgets.ClientWidgetApi(widget, container, driver)
  const cbxIsReady = document.getElementById('cbxIsReady')
  const txtLastMsg = document.getElementById('txtLastMsg')
  const txtSendMessageType = document.getElementById('txtSendMessageType')
  const txtSendMessagePayload = document.getElementById('txtSendMessagePayload')
  const btnSendMessage = document.getElementById('btnSendMessage')
  const txtMessagesCount = document.getElementById('messagesCount')
  const txtLastMessageReceivedAction = document.getElementById('lastMessageReceivedAction')
  container.src = bldrsWidget.url
  api.on('ready', () => {
    cbxIsReady.checked = true
  })
  listenToApiAction(
    EVENT_CLIENT_SELECTIONCHANGED_ELEMENTS,
    (ev) => {
      let _a
      console.log('bldrs-inside-iframe#listenToApiAction, EVENT_CLIENT_SELECTIONCHANGED_ELEMENTS:', ev)
      txtLastMsg.value = JSON.stringify((_a = ev.detail) != null ? _a : '')
    },
  )
  listenToApiAction(
    EVENT_CLIENT_MODEL_LOADED,
    (ev) => {
      let _a
      console.log('bldrs-inside-iframe#listenToApiAction, EVENT_CLIENT_MODEL_LOADED:', ev)
      txtLastMsg.value = JSON.stringify((_a = ev.detail) != null ? _a : '')
    },
  )
  listenToApiAction(
    EVENT_CLIENT_HIDDEN_ELEMENTS,
    (ev) => {
      let _a
      console.log('bldrs-inside-iframe#listenToApiAction, EVENT_CLIENT_HIDDEN_ELEMENTS:', ev)
      txtLastMsg.value = JSON.stringify((_a = ev.detail) != null ? _a : '')
    },
  )
  btnSendMessage.addEventListener('click', () => {
    const messageType = txtSendMessageType.value
    const messagePayload = JSON.parse(txtSendMessagePayload.value)
    api.transport.send(messageType, messagePayload)
  })
  let messagesReceivedCount = 0
  /**
   *
   */
  function listenToApiAction(actionName, callback) {
    api.on('action:'.concat(actionName), (e) => {
      console.log('bldrs-inside-iframe#listenToApiAction, event:', e)
      if (e.type === 'DOMContentLoaded') {
        console.log('bldrs-inside-iframe#listenToApiAction, ignoring event of type DOMContentLoaded')
        return
      }
      e.preventDefault()
      messagesReceivedCount++
      if (callback) {
        callback(e)
      }
      api.transport.reply(e.detail, {})
      txtMessagesCount.innerText = messagesReceivedCount
      txtLastMessageReceivedAction.innerText = e.detail.action
    })
  }
  __name(listenToApiAction, 'listenToApiAction')
})
/* ! Bundled license information:

matrix-widget-api/lib/WidgetApi.js:
  (*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE *)

matrix-widget-api/lib/ClientWidgetApi.js:
  (*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE *)
*/
// # sourceMappingURL=bldrs-inside-iframe-bundle.js.map
