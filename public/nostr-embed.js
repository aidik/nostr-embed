var NostrEmbed = (function () {
	'use strict';

	/** @returns {void} */
	function noop() {}

	function run(fn) {
		return fn();
	}

	function blank_object() {
		return Object.create(null);
	}

	/**
	 * @param {Function[]} fns
	 * @returns {void}
	 */
	function run_all(fns) {
		fns.forEach(run);
	}

	/**
	 * @param {any} thing
	 * @returns {thing is Function}
	 */
	function is_function(thing) {
		return typeof thing === 'function';
	}

	/** @returns {boolean} */
	function safe_not_equal(a, b) {
		return a != a ? b == b : a !== b || (a && typeof a === 'object') || typeof a === 'function';
	}

	/** @returns {boolean} */
	function is_empty(obj) {
		return Object.keys(obj).length === 0;
	}

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @returns {void}
	 */
	function append(target, node) {
		target.appendChild(node);
	}

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @param {Node} [anchor]
	 * @returns {void}
	 */
	function insert(target, node, anchor) {
		target.insertBefore(node, anchor || null);
	}

	/**
	 * @param {Node} node
	 * @returns {void}
	 */
	function detach(node) {
		if (node.parentNode) {
			node.parentNode.removeChild(node);
		}
	}

	/**
	 * @template {keyof HTMLElementTagNameMap} K
	 * @param {K} name
	 * @returns {HTMLElementTagNameMap[K]}
	 */
	function element(name) {
		return document.createElement(name);
	}

	/**
	 * @param {string} data
	 * @returns {Text}
	 */
	function text(data) {
		return document.createTextNode(data);
	}

	/**
	 * @returns {Text} */
	function empty() {
		return text('');
	}

	/**
	 * @param {Element} node
	 * @param {string} attribute
	 * @param {string} [value]
	 * @returns {void}
	 */
	function attr(node, attribute, value) {
		if (value == null) node.removeAttribute(attribute);
		else if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
	}

	/**
	 * @param {Element} element
	 * @returns {ChildNode[]}
	 */
	function children(element) {
		return Array.from(element.childNodes);
	}

	/**
	 * @param {Text} text
	 * @param {unknown} data
	 * @returns {void}
	 */
	function set_data(text, data) {
		data = '' + data;
		if (text.data === data) return;
		text.data = /** @type {string} */ (data);
	}

	/**
	 * @returns {void} */
	function set_style(node, key, value, important) {
		{
			node.style.setProperty(key, value, '');
		}
	}

	/**
	 * @param {HTMLElement} element
	 * @returns {{}}
	 */
	function get_custom_elements_slots(element) {
		const result = {};
		element.childNodes.forEach(
			/** @param {Element} node */ (node) => {
				result[node.slot || 'default'] = true;
			}
		);
		return result;
	}

	/**
	 * @typedef {Node & {
	 * 	claim_order?: number;
	 * 	hydrate_init?: true;
	 * 	actual_end_child?: NodeEx;
	 * 	childNodes: NodeListOf<NodeEx>;
	 * }} NodeEx
	 */

	/** @typedef {ChildNode & NodeEx} ChildNodeEx */

	/** @typedef {NodeEx & { claim_order: number }} NodeEx2 */

	/**
	 * @typedef {ChildNodeEx[] & {
	 * 	claim_info?: {
	 * 		last_index: number;
	 * 		total_claimed: number;
	 * 	};
	 * }} ChildNodeArray
	 */

	let current_component;

	/** @returns {void} */
	function set_current_component(component) {
		current_component = component;
	}

	const dirty_components = [];
	const binding_callbacks = [];

	let render_callbacks = [];

	const flush_callbacks = [];

	const resolved_promise = /* @__PURE__ */ Promise.resolve();

	let update_scheduled = false;

	/** @returns {void} */
	function schedule_update() {
		if (!update_scheduled) {
			update_scheduled = true;
			resolved_promise.then(flush);
		}
	}

	/** @returns {void} */
	function add_render_callback(fn) {
		render_callbacks.push(fn);
	}

	// flush() calls callbacks in this order:
	// 1. All beforeUpdate callbacks, in order: parents before children
	// 2. All bind:this callbacks, in reverse order: children before parents.
	// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
	//    for afterUpdates called during the initial onMount, which are called in
	//    reverse order: children before parents.
	// Since callbacks might update component values, which could trigger another
	// call to flush(), the following steps guard against this:
	// 1. During beforeUpdate, any updated components will be added to the
	//    dirty_components array and will cause a reentrant call to flush(). Because
	//    the flush index is kept outside the function, the reentrant call will pick
	//    up where the earlier call left off and go through all dirty components. The
	//    current_component value is saved and restored so that the reentrant call will
	//    not interfere with the "parent" flush() call.
	// 2. bind:this callbacks cannot trigger new flush() calls.
	// 3. During afterUpdate, any updated components will NOT have their afterUpdate
	//    callback called a second time; the seen_callbacks set, outside the flush()
	//    function, guarantees this behavior.
	const seen_callbacks = new Set();

	let flushidx = 0; // Do *not* move this inside the flush() function

	/** @returns {void} */
	function flush() {
		// Do not reenter flush while dirty components are updated, as this can
		// result in an infinite loop. Instead, let the inner flush handle it.
		// Reentrancy is ok afterwards for bindings etc.
		if (flushidx !== 0) {
			return;
		}
		const saved_component = current_component;
		do {
			// first, call beforeUpdate functions
			// and update components
			try {
				while (flushidx < dirty_components.length) {
					const component = dirty_components[flushidx];
					flushidx++;
					set_current_component(component);
					update(component.$$);
				}
			} catch (e) {
				// reset dirty state to not end up in a deadlocked state and then rethrow
				dirty_components.length = 0;
				flushidx = 0;
				throw e;
			}
			set_current_component(null);
			dirty_components.length = 0;
			flushidx = 0;
			while (binding_callbacks.length) binding_callbacks.pop()();
			// then, once components are updated, call
			// afterUpdate functions. This may cause
			// subsequent updates...
			for (let i = 0; i < render_callbacks.length; i += 1) {
				const callback = render_callbacks[i];
				if (!seen_callbacks.has(callback)) {
					// ...so guard against infinite loops
					seen_callbacks.add(callback);
					callback();
				}
			}
			render_callbacks.length = 0;
		} while (dirty_components.length);
		while (flush_callbacks.length) {
			flush_callbacks.pop()();
		}
		update_scheduled = false;
		seen_callbacks.clear();
		set_current_component(saved_component);
	}

	/** @returns {void} */
	function update($$) {
		if ($$.fragment !== null) {
			$$.update();
			run_all($$.before_update);
			const dirty = $$.dirty;
			$$.dirty = [-1];
			$$.fragment && $$.fragment.p($$.ctx, dirty);
			$$.after_update.forEach(add_render_callback);
		}
	}

	/**
	 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
	 * @param {Function[]} fns
	 * @returns {void}
	 */
	function flush_render_callbacks(fns) {
		const filtered = [];
		const targets = [];
		render_callbacks.forEach((c) => (fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c)));
		targets.forEach((c) => c());
		render_callbacks = filtered;
	}

	const outroing = new Set();

	/**
	 * @param {import('./private.js').Fragment} block
	 * @param {0 | 1} [local]
	 * @returns {void}
	 */
	function transition_in(block, local) {
		if (block && block.i) {
			outroing.delete(block);
			block.i(local);
		}
	}

	/** @typedef {1} INTRO */
	/** @typedef {0} OUTRO */
	/** @typedef {{ direction: 'in' | 'out' | 'both' }} TransitionOptions */
	/** @typedef {(node: Element, params: any, options: TransitionOptions) => import('../transition/public.js').TransitionConfig} TransitionFn */

	/**
	 * @typedef {Object} Outro
	 * @property {number} r
	 * @property {Function[]} c
	 * @property {Object} p
	 */

	/**
	 * @typedef {Object} PendingProgram
	 * @property {number} start
	 * @property {INTRO|OUTRO} b
	 * @property {Outro} [group]
	 */

	/**
	 * @typedef {Object} Program
	 * @property {number} a
	 * @property {INTRO|OUTRO} b
	 * @property {1|-1} d
	 * @property {number} duration
	 * @property {number} start
	 * @property {number} end
	 * @property {Outro} [group]
	 */

	/** @returns {void} */
	function mount_component(component, target, anchor) {
		const { fragment, after_update } = component.$$;
		fragment && fragment.m(target, anchor);
		// onMount happens before the initial afterUpdate
		add_render_callback(() => {
			const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
			// if the component was destroyed immediately
			// it will update the `$$.on_destroy` reference to `null`.
			// the destructured on_destroy may still reference to the old array
			if (component.$$.on_destroy) {
				component.$$.on_destroy.push(...new_on_destroy);
			} else {
				// Edge case - component was destroyed immediately,
				// most likely as a result of a binding initialising
				run_all(new_on_destroy);
			}
			component.$$.on_mount = [];
		});
		after_update.forEach(add_render_callback);
	}

	/** @returns {void} */
	function destroy_component(component, detaching) {
		const $$ = component.$$;
		if ($$.fragment !== null) {
			flush_render_callbacks($$.after_update);
			run_all($$.on_destroy);
			$$.fragment && $$.fragment.d(detaching);
			// TODO null out other refs, including component.$$ (but need to
			// preserve final state?)
			$$.on_destroy = $$.fragment = null;
			$$.ctx = [];
		}
	}

	/** @returns {void} */
	function make_dirty(component, i) {
		if (component.$$.dirty[0] === -1) {
			dirty_components.push(component);
			schedule_update();
			component.$$.dirty.fill(0);
		}
		component.$$.dirty[(i / 31) | 0] |= 1 << i % 31;
	}

	// TODO: Document the other params
	/**
	 * @param {SvelteComponent} component
	 * @param {import('./public.js').ComponentConstructorOptions} options
	 *
	 * @param {import('./utils.js')['not_equal']} not_equal Used to compare props and state values.
	 * @param {(target: Element | ShadowRoot) => void} [append_styles] Function that appends styles to the DOM when the component is first initialised.
	 * This will be the `add_css` function from the compiled component.
	 *
	 * @returns {void}
	 */
	function init(
		component,
		options,
		instance,
		create_fragment,
		not_equal,
		props,
		append_styles = null,
		dirty = [-1]
	) {
		const parent_component = current_component;
		set_current_component(component);
		/** @type {import('./private.js').T$$} */
		const $$ = (component.$$ = {
			fragment: null,
			ctx: [],
			// state
			props,
			update: noop,
			not_equal,
			bound: blank_object(),
			// lifecycle
			on_mount: [],
			on_destroy: [],
			on_disconnect: [],
			before_update: [],
			after_update: [],
			context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
			// everything else
			callbacks: blank_object(),
			dirty,
			skip_bound: false,
			root: options.target || parent_component.$$.root
		});
		append_styles && append_styles($$.root);
		let ready = false;
		$$.ctx = instance(component, options.props || {}, (i, ret, ...rest) => {
					const value = rest.length ? rest[0] : ret;
					if ($$.ctx && not_equal($$.ctx[i], ($$.ctx[i] = value))) {
						if (!$$.skip_bound && $$.bound[i]) $$.bound[i](value);
						if (ready) make_dirty(component, i);
					}
					return ret;
			  })
			;
		$$.update();
		ready = true;
		run_all($$.before_update);
		// `false` as a special case of no DOM component
		$$.fragment = create_fragment($$.ctx) ;
		if (options.target) {
			if (options.hydrate) {
				// TODO: what is the correct type here?
				// @ts-expect-error
				const nodes = children(options.target);
				$$.fragment && $$.fragment.l(nodes);
				nodes.forEach(detach);
			} else {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				$$.fragment && $$.fragment.c();
			}
			if (options.intro) transition_in(component.$$.fragment);
			mount_component(component, options.target, options.anchor);
			flush();
		}
		set_current_component(parent_component);
	}

	let SvelteElement;

	if (typeof HTMLElement === 'function') {
		SvelteElement = class extends HTMLElement {
			/** The Svelte component constructor */
			$$ctor;
			/** Slots */
			$$s;
			/** The Svelte component instance */
			$$c;
			/** Whether or not the custom element is connected */
			$$cn = false;
			/** Component props data */
			$$d = {};
			/** `true` if currently in the process of reflecting component props back to attributes */
			$$r = false;
			/** @type {Record<string, CustomElementPropDefinition>} Props definition (name, reflected, type etc) */
			$$p_d = {};
			/** @type {Record<string, Function[]>} Event listeners */
			$$l = {};
			/** @type {Map<Function, Function>} Event listener unsubscribe functions */
			$$l_u = new Map();

			constructor($$componentCtor, $$slots, use_shadow_dom) {
				super();
				this.$$ctor = $$componentCtor;
				this.$$s = $$slots;
				if (use_shadow_dom) {
					this.attachShadow({ mode: 'open' });
				}
			}

			addEventListener(type, listener, options) {
				// We can't determine upfront if the event is a custom event or not, so we have to
				// listen to both. If someone uses a custom event with the same name as a regular
				// browser event, this fires twice - we can't avoid that.
				this.$$l[type] = this.$$l[type] || [];
				this.$$l[type].push(listener);
				if (this.$$c) {
					const unsub = this.$$c.$on(type, listener);
					this.$$l_u.set(listener, unsub);
				}
				super.addEventListener(type, listener, options);
			}

			removeEventListener(type, listener, options) {
				super.removeEventListener(type, listener, options);
				if (this.$$c) {
					const unsub = this.$$l_u.get(listener);
					if (unsub) {
						unsub();
						this.$$l_u.delete(listener);
					}
				}
			}

			async connectedCallback() {
				this.$$cn = true;
				if (!this.$$c) {
					// We wait one tick to let possible child slot elements be created/mounted
					await Promise.resolve();
					if (!this.$$cn || this.$$c) {
						return;
					}
					function create_slot(name) {
						return () => {
							let node;
							const obj = {
								c: function create() {
									node = element('slot');
									if (name !== 'default') {
										attr(node, 'name', name);
									}
								},
								/**
								 * @param {HTMLElement} target
								 * @param {HTMLElement} [anchor]
								 */
								m: function mount(target, anchor) {
									insert(target, node, anchor);
								},
								d: function destroy(detaching) {
									if (detaching) {
										detach(node);
									}
								}
							};
							return obj;
						};
					}
					const $$slots = {};
					const existing_slots = get_custom_elements_slots(this);
					for (const name of this.$$s) {
						if (name in existing_slots) {
							$$slots[name] = [create_slot(name)];
						}
					}
					for (const attribute of this.attributes) {
						// this.$$data takes precedence over this.attributes
						const name = this.$$g_p(attribute.name);
						if (!(name in this.$$d)) {
							this.$$d[name] = get_custom_element_value(name, attribute.value, this.$$p_d, 'toProp');
						}
					}
					// Port over props that were set programmatically before ce was initialized
					for (const key in this.$$p_d) {
						if (!(key in this.$$d) && this[key] !== undefined) {
							this.$$d[key] = this[key]; // don't transform, these were set through JavaScript
							delete this[key]; // remove the property that shadows the getter/setter
						}
					}
					this.$$c = new this.$$ctor({
						target: this.shadowRoot || this,
						props: {
							...this.$$d,
							$$slots,
							$$scope: {
								ctx: []
							}
						}
					});

					// Reflect component props as attributes
					const reflect_attributes = () => {
						this.$$r = true;
						for (const key in this.$$p_d) {
							this.$$d[key] = this.$$c.$$.ctx[this.$$c.$$.props[key]];
							if (this.$$p_d[key].reflect) {
								const attribute_value = get_custom_element_value(
									key,
									this.$$d[key],
									this.$$p_d,
									'toAttribute'
								);
								if (attribute_value == null) {
									this.removeAttribute(this.$$p_d[key].attribute || key);
								} else {
									this.setAttribute(this.$$p_d[key].attribute || key, attribute_value);
								}
							}
						}
						this.$$r = false;
					};
					this.$$c.$$.after_update.push(reflect_attributes);
					reflect_attributes(); // once initially because after_update is added too late for first render

					for (const type in this.$$l) {
						for (const listener of this.$$l[type]) {
							const unsub = this.$$c.$on(type, listener);
							this.$$l_u.set(listener, unsub);
						}
					}
					this.$$l = {};
				}
			}

			// We don't need this when working within Svelte code, but for compatibility of people using this outside of Svelte
			// and setting attributes through setAttribute etc, this is helpful
			attributeChangedCallback(attr, _oldValue, newValue) {
				if (this.$$r) return;
				attr = this.$$g_p(attr);
				this.$$d[attr] = get_custom_element_value(attr, newValue, this.$$p_d, 'toProp');
				this.$$c?.$set({ [attr]: this.$$d[attr] });
			}

			disconnectedCallback() {
				this.$$cn = false;
				// In a microtask, because this could be a move within the DOM
				Promise.resolve().then(() => {
					if (!this.$$cn && this.$$c) {
						this.$$c.$destroy();
						this.$$c = undefined;
					}
				});
			}

			$$g_p(attribute_name) {
				return (
					Object.keys(this.$$p_d).find(
						(key) =>
							this.$$p_d[key].attribute === attribute_name ||
							(!this.$$p_d[key].attribute && key.toLowerCase() === attribute_name)
					) || attribute_name
				);
			}
		};
	}

	/**
	 * @param {string} prop
	 * @param {any} value
	 * @param {Record<string, CustomElementPropDefinition>} props_definition
	 * @param {'toAttribute' | 'toProp'} [transform]
	 */
	function get_custom_element_value(prop, value, props_definition, transform) {
		const type = props_definition[prop]?.type;
		value = type === 'Boolean' && typeof value !== 'boolean' ? value != null : value;
		if (!transform || !props_definition[prop]) {
			return value;
		} else if (transform === 'toAttribute') {
			switch (type) {
				case 'Object':
				case 'Array':
					return value == null ? null : JSON.stringify(value);
				case 'Boolean':
					return value ? '' : null;
				case 'Number':
					return value == null ? null : value;
				default:
					return value;
			}
		} else {
			switch (type) {
				case 'Object':
				case 'Array':
					return value && JSON.parse(value);
				case 'Boolean':
					return value; // conversion already handled above
				case 'Number':
					return value != null ? +value : value;
				default:
					return value;
			}
		}
	}

	/**
	 * @internal
	 *
	 * Turn a Svelte component into a custom element.
	 * @param {import('./public.js').ComponentType} Component  A Svelte component constructor
	 * @param {Record<string, CustomElementPropDefinition>} props_definition  The props to observe
	 * @param {string[]} slots  The slots to create
	 * @param {string[]} accessors  Other accessors besides the ones for props the component has
	 * @param {boolean} use_shadow_dom  Whether to use shadow DOM
	 * @param {(ce: new () => HTMLElement) => new () => HTMLElement} [extend]
	 */
	function create_custom_element(
		Component,
		props_definition,
		slots,
		accessors,
		use_shadow_dom,
		extend
	) {
		let Class = class extends SvelteElement {
			constructor() {
				super(Component, slots, use_shadow_dom);
				this.$$p_d = props_definition;
			}
			static get observedAttributes() {
				return Object.keys(props_definition).map((key) =>
					(props_definition[key].attribute || key).toLowerCase()
				);
			}
		};
		Object.keys(props_definition).forEach((prop) => {
			Object.defineProperty(Class.prototype, prop, {
				get() {
					return this.$$c && prop in this.$$c ? this.$$c[prop] : this.$$d[prop];
				},
				set(value) {
					value = get_custom_element_value(prop, value, props_definition);
					this.$$d[prop] = value;
					this.$$c?.$set({ [prop]: value });
				}
			});
		});
		accessors.forEach((accessor) => {
			Object.defineProperty(Class.prototype, accessor, {
				get() {
					return this.$$c?.[accessor];
				}
			});
		});
		Component.element = /** @type {any} */ (Class);
		return Class;
	}

	/**
	 * Base class for Svelte components. Used when dev=false.
	 *
	 * @template {Record<string, any>} [Props=any]
	 * @template {Record<string, any>} [Events=any]
	 */
	class SvelteComponent {
		/**
		 * ### PRIVATE API
		 *
		 * Do not use, may change at any time
		 *
		 * @type {any}
		 */
		$$ = undefined;
		/**
		 * ### PRIVATE API
		 *
		 * Do not use, may change at any time
		 *
		 * @type {any}
		 */
		$$set = undefined;

		/** @returns {void} */
		$destroy() {
			destroy_component(this, 1);
			this.$destroy = noop;
		}

		/**
		 * @template {Extract<keyof Events, string>} K
		 * @param {K} type
		 * @param {((e: Events[K]) => void) | null | undefined} callback
		 * @returns {() => void}
		 */
		$on(type, callback) {
			if (!is_function(callback)) {
				return noop;
			}
			const callbacks = this.$$.callbacks[type] || (this.$$.callbacks[type] = []);
			callbacks.push(callback);
			return () => {
				const index = callbacks.indexOf(callback);
				if (index !== -1) callbacks.splice(index, 1);
			};
		}

		/**
		 * @param {Partial<Props>} props
		 * @returns {void}
		 */
		$set(props) {
			if (this.$$set && !is_empty(props)) {
				this.$$.skip_bound = true;
				this.$$set(props);
				this.$$.skip_bound = false;
			}
		}
	}

	/**
	 * @typedef {Object} CustomElementPropDefinition
	 * @property {string} [attribute]
	 * @property {boolean} [reflect]
	 * @property {'String'|'Boolean'|'Number'|'Array'|'Object'} [type]
	 */

	// generated during release, do not modify

	const PUBLIC_VERSION = '4';

	if (typeof window !== 'undefined')
		// @ts-ignore
		(window.__svelte || (window.__svelte = { v: new Set() })).v.add(PUBLIC_VERSION);

	function number$1(n) {
	    if (!Number.isSafeInteger(n) || n < 0)
	        throw new Error(`Wrong positive integer: ${n}`);
	}
	function bytes$1(b, ...lengths) {
	    if (!(b instanceof Uint8Array))
	        throw new Error('Expected Uint8Array');
	    if (lengths.length > 0 && !lengths.includes(b.length))
	        throw new Error(`Expected Uint8Array of length ${lengths}, not of length=${b.length}`);
	}
	function hash$1(hash) {
	    if (typeof hash !== 'function' || typeof hash.create !== 'function')
	        throw new Error('Hash should be wrapped by utils.wrapConstructor');
	    number$1(hash.outputLen);
	    number$1(hash.blockLen);
	}
	function exists$1(instance, checkFinished = true) {
	    if (instance.destroyed)
	        throw new Error('Hash instance has been destroyed');
	    if (checkFinished && instance.finished)
	        throw new Error('Hash#digest() has already been called');
	}
	function output$1(out, instance) {
	    bytes$1(out);
	    const min = instance.outputLen;
	    if (out.length < min) {
	        throw new Error(`digestInto() expects output buffer of length at least ${min}`);
	    }
	}

	const crypto = typeof globalThis === 'object' && 'crypto' in globalThis ? globalThis.crypto : undefined;

	/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
	// We use WebCrypto aka globalThis.crypto, which exists in browsers and node.js 16+.
	// node.js versions earlier than v19 don't declare it in global scope.
	// For node.js, package.json#exports field mapping rewrites import
	// from `crypto` to `cryptoNode`, which imports native module.
	// Makes the utils un-importable in browsers without a bundler.
	// Once node.js 18 is deprecated, we can just drop the import.
	const u8a$2 = (a) => a instanceof Uint8Array;
	// Cast array to view
	const createView$1 = (arr) => new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
	// The rotate right (circular right shift) operation for uint32
	const rotr$1 = (word, shift) => (word << (32 - shift)) | (word >>> shift);
	// big-endian hardware is rare. Just in case someone still decides to run hashes:
	// early-throw an error because we don't support BE yet.
	const isLE$1 = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
	if (!isLE$1)
	    throw new Error('Non little-endian hardware is not supported');
	/**
	 * @example utf8ToBytes('abc') // new Uint8Array([97, 98, 99])
	 */
	function utf8ToBytes$2(str) {
	    if (typeof str !== 'string')
	        throw new Error(`utf8ToBytes expected string, got ${typeof str}`);
	    return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
	}
	/**
	 * Normalizes (non-hex) string or Uint8Array to Uint8Array.
	 * Warning: when Uint8Array is passed, it would NOT get copied.
	 * Keep in mind for future mutable operations.
	 */
	function toBytes$1(data) {
	    if (typeof data === 'string')
	        data = utf8ToBytes$2(data);
	    if (!u8a$2(data))
	        throw new Error(`expected Uint8Array, got ${typeof data}`);
	    return data;
	}
	/**
	 * Copies several Uint8Arrays into one.
	 */
	function concatBytes$1(...arrays) {
	    const r = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
	    let pad = 0; // walk through each item, ensure they have proper type
	    arrays.forEach((a) => {
	        if (!u8a$2(a))
	            throw new Error('Uint8Array expected');
	        r.set(a, pad);
	        pad += a.length;
	    });
	    return r;
	}
	// For runtime check if class implements interface
	let Hash$1 = class Hash {
	    // Safe version that clones internal state
	    clone() {
	        return this._cloneInto();
	    }
	};
	function wrapConstructor$1(hashCons) {
	    const hashC = (msg) => hashCons().update(toBytes$1(msg)).digest();
	    const tmp = hashCons();
	    hashC.outputLen = tmp.outputLen;
	    hashC.blockLen = tmp.blockLen;
	    hashC.create = () => hashCons();
	    return hashC;
	}
	/**
	 * Secure PRNG. Uses `crypto.getRandomValues`, which defers to OS.
	 */
	function randomBytes(bytesLength = 32) {
	    if (crypto && typeof crypto.getRandomValues === 'function') {
	        return crypto.getRandomValues(new Uint8Array(bytesLength));
	    }
	    throw new Error('crypto.getRandomValues must be defined');
	}

	// Polyfill for Safari 14
	function setBigUint64$1(view, byteOffset, value, isLE) {
	    if (typeof view.setBigUint64 === 'function')
	        return view.setBigUint64(byteOffset, value, isLE);
	    const _32n = BigInt(32);
	    const _u32_max = BigInt(0xffffffff);
	    const wh = Number((value >> _32n) & _u32_max);
	    const wl = Number(value & _u32_max);
	    const h = isLE ? 4 : 0;
	    const l = isLE ? 0 : 4;
	    view.setUint32(byteOffset + h, wh, isLE);
	    view.setUint32(byteOffset + l, wl, isLE);
	}
	// Base SHA2 class (RFC 6234)
	let SHA2$1 = class SHA2 extends Hash$1 {
	    constructor(blockLen, outputLen, padOffset, isLE) {
	        super();
	        this.blockLen = blockLen;
	        this.outputLen = outputLen;
	        this.padOffset = padOffset;
	        this.isLE = isLE;
	        this.finished = false;
	        this.length = 0;
	        this.pos = 0;
	        this.destroyed = false;
	        this.buffer = new Uint8Array(blockLen);
	        this.view = createView$1(this.buffer);
	    }
	    update(data) {
	        exists$1(this);
	        const { view, buffer, blockLen } = this;
	        data = toBytes$1(data);
	        const len = data.length;
	        for (let pos = 0; pos < len;) {
	            const take = Math.min(blockLen - this.pos, len - pos);
	            // Fast path: we have at least one block in input, cast it to view and process
	            if (take === blockLen) {
	                const dataView = createView$1(data);
	                for (; blockLen <= len - pos; pos += blockLen)
	                    this.process(dataView, pos);
	                continue;
	            }
	            buffer.set(data.subarray(pos, pos + take), this.pos);
	            this.pos += take;
	            pos += take;
	            if (this.pos === blockLen) {
	                this.process(view, 0);
	                this.pos = 0;
	            }
	        }
	        this.length += data.length;
	        this.roundClean();
	        return this;
	    }
	    digestInto(out) {
	        exists$1(this);
	        output$1(out, this);
	        this.finished = true;
	        // Padding
	        // We can avoid allocation of buffer for padding completely if it
	        // was previously not allocated here. But it won't change performance.
	        const { buffer, view, blockLen, isLE } = this;
	        let { pos } = this;
	        // append the bit '1' to the message
	        buffer[pos++] = 0b10000000;
	        this.buffer.subarray(pos).fill(0);
	        // we have less than padOffset left in buffer, so we cannot put length in current block, need process it and pad again
	        if (this.padOffset > blockLen - pos) {
	            this.process(view, 0);
	            pos = 0;
	        }
	        // Pad until full block byte with zeros
	        for (let i = pos; i < blockLen; i++)
	            buffer[i] = 0;
	        // Note: sha512 requires length to be 128bit integer, but length in JS will overflow before that
	        // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
	        // So we just write lowest 64 bits of that value.
	        setBigUint64$1(view, blockLen - 8, BigInt(this.length * 8), isLE);
	        this.process(view, 0);
	        const oview = createView$1(out);
	        const len = this.outputLen;
	        // NOTE: we do division by 4 later, which should be fused in single op with modulo by JIT
	        if (len % 4)
	            throw new Error('_sha2: outputLen should be aligned to 32bit');
	        const outLen = len / 4;
	        const state = this.get();
	        if (outLen > state.length)
	            throw new Error('_sha2: outputLen bigger than state');
	        for (let i = 0; i < outLen; i++)
	            oview.setUint32(4 * i, state[i], isLE);
	    }
	    digest() {
	        const { buffer, outputLen } = this;
	        this.digestInto(buffer);
	        const res = buffer.slice(0, outputLen);
	        this.destroy();
	        return res;
	    }
	    _cloneInto(to) {
	        to || (to = new this.constructor());
	        to.set(...this.get());
	        const { blockLen, buffer, length, finished, destroyed, pos } = this;
	        to.length = length;
	        to.pos = pos;
	        to.finished = finished;
	        to.destroyed = destroyed;
	        if (length % blockLen)
	            to.buffer.set(buffer);
	        return to;
	    }
	};

	// SHA2-256 need to try 2^128 hashes to execute birthday attack.
	// BTC network is doing 2^67 hashes/sec as per early 2023.
	// Choice: a ? b : c
	const Chi$1 = (a, b, c) => (a & b) ^ (~a & c);
	// Majority function, true if any two inpust is true
	const Maj$1 = (a, b, c) => (a & b) ^ (a & c) ^ (b & c);
	// Round constants:
	// first 32 bits of the fractional parts of the cube roots of the first 64 primes 2..311)
	// prettier-ignore
	const SHA256_K$1 = /* @__PURE__ */ new Uint32Array([
	    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
	]);
	// Initial state (first 32 bits of the fractional parts of the square roots of the first 8 primes 2..19):
	// prettier-ignore
	const IV$1 = /* @__PURE__ */ new Uint32Array([
	    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
	]);
	// Temporary buffer, not used to store anything between runs
	// Named this way because it matches specification.
	const SHA256_W$1 = /* @__PURE__ */ new Uint32Array(64);
	let SHA256$1 = class SHA256 extends SHA2$1 {
	    constructor() {
	        super(64, 32, 8, false);
	        // We cannot use array here since array allows indexing by variable
	        // which means optimizer/compiler cannot use registers.
	        this.A = IV$1[0] | 0;
	        this.B = IV$1[1] | 0;
	        this.C = IV$1[2] | 0;
	        this.D = IV$1[3] | 0;
	        this.E = IV$1[4] | 0;
	        this.F = IV$1[5] | 0;
	        this.G = IV$1[6] | 0;
	        this.H = IV$1[7] | 0;
	    }
	    get() {
	        const { A, B, C, D, E, F, G, H } = this;
	        return [A, B, C, D, E, F, G, H];
	    }
	    // prettier-ignore
	    set(A, B, C, D, E, F, G, H) {
	        this.A = A | 0;
	        this.B = B | 0;
	        this.C = C | 0;
	        this.D = D | 0;
	        this.E = E | 0;
	        this.F = F | 0;
	        this.G = G | 0;
	        this.H = H | 0;
	    }
	    process(view, offset) {
	        // Extend the first 16 words into the remaining 48 words w[16..63] of the message schedule array
	        for (let i = 0; i < 16; i++, offset += 4)
	            SHA256_W$1[i] = view.getUint32(offset, false);
	        for (let i = 16; i < 64; i++) {
	            const W15 = SHA256_W$1[i - 15];
	            const W2 = SHA256_W$1[i - 2];
	            const s0 = rotr$1(W15, 7) ^ rotr$1(W15, 18) ^ (W15 >>> 3);
	            const s1 = rotr$1(W2, 17) ^ rotr$1(W2, 19) ^ (W2 >>> 10);
	            SHA256_W$1[i] = (s1 + SHA256_W$1[i - 7] + s0 + SHA256_W$1[i - 16]) | 0;
	        }
	        // Compression function main loop, 64 rounds
	        let { A, B, C, D, E, F, G, H } = this;
	        for (let i = 0; i < 64; i++) {
	            const sigma1 = rotr$1(E, 6) ^ rotr$1(E, 11) ^ rotr$1(E, 25);
	            const T1 = (H + sigma1 + Chi$1(E, F, G) + SHA256_K$1[i] + SHA256_W$1[i]) | 0;
	            const sigma0 = rotr$1(A, 2) ^ rotr$1(A, 13) ^ rotr$1(A, 22);
	            const T2 = (sigma0 + Maj$1(A, B, C)) | 0;
	            H = G;
	            G = F;
	            F = E;
	            E = (D + T1) | 0;
	            D = C;
	            C = B;
	            B = A;
	            A = (T1 + T2) | 0;
	        }
	        // Add the compressed chunk to the current hash value
	        A = (A + this.A) | 0;
	        B = (B + this.B) | 0;
	        C = (C + this.C) | 0;
	        D = (D + this.D) | 0;
	        E = (E + this.E) | 0;
	        F = (F + this.F) | 0;
	        G = (G + this.G) | 0;
	        H = (H + this.H) | 0;
	        this.set(A, B, C, D, E, F, G, H);
	    }
	    roundClean() {
	        SHA256_W$1.fill(0);
	    }
	    destroy() {
	        this.set(0, 0, 0, 0, 0, 0, 0, 0);
	        this.buffer.fill(0);
	    }
	};
	/**
	 * SHA2-256 hash function
	 * @param message - data that would be hashed
	 */
	const sha256$1 = /* @__PURE__ */ wrapConstructor$1(() => new SHA256$1());

	/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
	// 100 lines of code in the file are duplicated from noble-hashes (utils).
	// This is OK: `abstract` directory does not use noble-hashes.
	// User may opt-in into using different hashing library. This way, noble-hashes
	// won't be included into their bundle.
	const _0n$4 = BigInt(0);
	const _1n$4 = BigInt(1);
	const _2n$2 = BigInt(2);
	const u8a$1 = (a) => a instanceof Uint8Array;
	const hexes$1 = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
	/**
	 * @example bytesToHex(Uint8Array.from([0xca, 0xfe, 0x01, 0x23])) // 'cafe0123'
	 */
	function bytesToHex$1(bytes) {
	    if (!u8a$1(bytes))
	        throw new Error('Uint8Array expected');
	    // pre-caching improves the speed 6x
	    let hex = '';
	    for (let i = 0; i < bytes.length; i++) {
	        hex += hexes$1[bytes[i]];
	    }
	    return hex;
	}
	function numberToHexUnpadded(num) {
	    const hex = num.toString(16);
	    return hex.length & 1 ? `0${hex}` : hex;
	}
	function hexToNumber(hex) {
	    if (typeof hex !== 'string')
	        throw new Error('hex string expected, got ' + typeof hex);
	    // Big Endian
	    return BigInt(hex === '' ? '0' : `0x${hex}`);
	}
	/**
	 * @example hexToBytes('cafe0123') // Uint8Array.from([0xca, 0xfe, 0x01, 0x23])
	 */
	function hexToBytes(hex) {
	    if (typeof hex !== 'string')
	        throw new Error('hex string expected, got ' + typeof hex);
	    const len = hex.length;
	    if (len % 2)
	        throw new Error('padded hex string expected, got unpadded hex of length ' + len);
	    const array = new Uint8Array(len / 2);
	    for (let i = 0; i < array.length; i++) {
	        const j = i * 2;
	        const hexByte = hex.slice(j, j + 2);
	        const byte = Number.parseInt(hexByte, 16);
	        if (Number.isNaN(byte) || byte < 0)
	            throw new Error('Invalid byte sequence');
	        array[i] = byte;
	    }
	    return array;
	}
	// BE: Big Endian, LE: Little Endian
	function bytesToNumberBE(bytes) {
	    return hexToNumber(bytesToHex$1(bytes));
	}
	function bytesToNumberLE(bytes) {
	    if (!u8a$1(bytes))
	        throw new Error('Uint8Array expected');
	    return hexToNumber(bytesToHex$1(Uint8Array.from(bytes).reverse()));
	}
	function numberToBytesBE(n, len) {
	    return hexToBytes(n.toString(16).padStart(len * 2, '0'));
	}
	function numberToBytesLE(n, len) {
	    return numberToBytesBE(n, len).reverse();
	}
	// Unpadded, rarely used
	function numberToVarBytesBE(n) {
	    return hexToBytes(numberToHexUnpadded(n));
	}
	/**
	 * Takes hex string or Uint8Array, converts to Uint8Array.
	 * Validates output length.
	 * Will throw error for other types.
	 * @param title descriptive title for an error e.g. 'private key'
	 * @param hex hex string or Uint8Array
	 * @param expectedLength optional, will compare to result array's length
	 * @returns
	 */
	function ensureBytes(title, hex, expectedLength) {
	    let res;
	    if (typeof hex === 'string') {
	        try {
	            res = hexToBytes(hex);
	        }
	        catch (e) {
	            throw new Error(`${title} must be valid hex string, got "${hex}". Cause: ${e}`);
	        }
	    }
	    else if (u8a$1(hex)) {
	        // Uint8Array.from() instead of hash.slice() because node.js Buffer
	        // is instance of Uint8Array, and its slice() creates **mutable** copy
	        res = Uint8Array.from(hex);
	    }
	    else {
	        throw new Error(`${title} must be hex string or Uint8Array`);
	    }
	    const len = res.length;
	    if (typeof expectedLength === 'number' && len !== expectedLength)
	        throw new Error(`${title} expected ${expectedLength} bytes, got ${len}`);
	    return res;
	}
	/**
	 * Copies several Uint8Arrays into one.
	 */
	function concatBytes(...arrays) {
	    const r = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
	    let pad = 0; // walk through each item, ensure they have proper type
	    arrays.forEach((a) => {
	        if (!u8a$1(a))
	            throw new Error('Uint8Array expected');
	        r.set(a, pad);
	        pad += a.length;
	    });
	    return r;
	}
	function equalBytes(b1, b2) {
	    // We don't care about timing attacks here
	    if (b1.length !== b2.length)
	        return false;
	    for (let i = 0; i < b1.length; i++)
	        if (b1[i] !== b2[i])
	            return false;
	    return true;
	}
	/**
	 * @example utf8ToBytes('abc') // new Uint8Array([97, 98, 99])
	 */
	function utf8ToBytes$1(str) {
	    if (typeof str !== 'string')
	        throw new Error(`utf8ToBytes expected string, got ${typeof str}`);
	    return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
	}
	// Bit operations
	/**
	 * Calculates amount of bits in a bigint.
	 * Same as `n.toString(2).length`
	 */
	function bitLen(n) {
	    let len;
	    for (len = 0; n > _0n$4; n >>= _1n$4, len += 1)
	        ;
	    return len;
	}
	/**
	 * Gets single bit at position.
	 * NOTE: first bit position is 0 (same as arrays)
	 * Same as `!!+Array.from(n.toString(2)).reverse()[pos]`
	 */
	function bitGet(n, pos) {
	    return (n >> BigInt(pos)) & _1n$4;
	}
	/**
	 * Sets single bit at position.
	 */
	const bitSet = (n, pos, value) => {
	    return n | ((value ? _1n$4 : _0n$4) << BigInt(pos));
	};
	/**
	 * Calculate mask for N bits. Not using ** operator with bigints because of old engines.
	 * Same as BigInt(`0b${Array(i).fill('1').join('')}`)
	 */
	const bitMask = (n) => (_2n$2 << BigInt(n - 1)) - _1n$4;
	// DRBG
	const u8n = (data) => new Uint8Array(data); // creates Uint8Array
	const u8fr = (arr) => Uint8Array.from(arr); // another shortcut
	/**
	 * Minimal HMAC-DRBG from NIST 800-90 for RFC6979 sigs.
	 * @returns function that will call DRBG until 2nd arg returns something meaningful
	 * @example
	 *   const drbg = createHmacDRBG<Key>(32, 32, hmac);
	 *   drbg(seed, bytesToKey); // bytesToKey must return Key or undefined
	 */
	function createHmacDrbg(hashLen, qByteLen, hmacFn) {
	    if (typeof hashLen !== 'number' || hashLen < 2)
	        throw new Error('hashLen must be a number');
	    if (typeof qByteLen !== 'number' || qByteLen < 2)
	        throw new Error('qByteLen must be a number');
	    if (typeof hmacFn !== 'function')
	        throw new Error('hmacFn must be a function');
	    // Step B, Step C: set hashLen to 8*ceil(hlen/8)
	    let v = u8n(hashLen); // Minimal non-full-spec HMAC-DRBG from NIST 800-90 for RFC6979 sigs.
	    let k = u8n(hashLen); // Steps B and C of RFC6979 3.2: set hashLen, in our case always same
	    let i = 0; // Iterations counter, will throw when over 1000
	    const reset = () => {
	        v.fill(1);
	        k.fill(0);
	        i = 0;
	    };
	    const h = (...b) => hmacFn(k, v, ...b); // hmac(k)(v, ...values)
	    const reseed = (seed = u8n()) => {
	        // HMAC-DRBG reseed() function. Steps D-G
	        k = h(u8fr([0x00]), seed); // k = hmac(k || v || 0x00 || seed)
	        v = h(); // v = hmac(k || v)
	        if (seed.length === 0)
	            return;
	        k = h(u8fr([0x01]), seed); // k = hmac(k || v || 0x01 || seed)
	        v = h(); // v = hmac(k || v)
	    };
	    const gen = () => {
	        // HMAC-DRBG generate() function
	        if (i++ >= 1000)
	            throw new Error('drbg: tried 1000 values');
	        let len = 0;
	        const out = [];
	        while (len < qByteLen) {
	            v = h();
	            const sl = v.slice();
	            out.push(sl);
	            len += v.length;
	        }
	        return concatBytes(...out);
	    };
	    const genUntil = (seed, pred) => {
	        reset();
	        reseed(seed); // Steps D-G
	        let res = undefined; // Step H: grind until k is in [1..n-1]
	        while (!(res = pred(gen())))
	            reseed();
	        reset();
	        return res;
	    };
	    return genUntil;
	}
	// Validating curves and fields
	const validatorFns = {
	    bigint: (val) => typeof val === 'bigint',
	    function: (val) => typeof val === 'function',
	    boolean: (val) => typeof val === 'boolean',
	    string: (val) => typeof val === 'string',
	    stringOrUint8Array: (val) => typeof val === 'string' || val instanceof Uint8Array,
	    isSafeInteger: (val) => Number.isSafeInteger(val),
	    array: (val) => Array.isArray(val),
	    field: (val, object) => object.Fp.isValid(val),
	    hash: (val) => typeof val === 'function' && Number.isSafeInteger(val.outputLen),
	};
	// type Record<K extends string | number | symbol, T> = { [P in K]: T; }
	function validateObject(object, validators, optValidators = {}) {
	    const checkField = (fieldName, type, isOptional) => {
	        const checkVal = validatorFns[type];
	        if (typeof checkVal !== 'function')
	            throw new Error(`Invalid validator "${type}", expected function`);
	        const val = object[fieldName];
	        if (isOptional && val === undefined)
	            return;
	        if (!checkVal(val, object)) {
	            throw new Error(`Invalid param ${String(fieldName)}=${val} (${typeof val}), expected ${type}`);
	        }
	    };
	    for (const [fieldName, type] of Object.entries(validators))
	        checkField(fieldName, type, false);
	    for (const [fieldName, type] of Object.entries(optValidators))
	        checkField(fieldName, type, true);
	    return object;
	}
	// validate type tests
	// const o: { a: number; b: number; c: number } = { a: 1, b: 5, c: 6 };
	// const z0 = validateObject(o, { a: 'isSafeInteger' }, { c: 'bigint' }); // Ok!
	// // Should fail type-check
	// const z1 = validateObject(o, { a: 'tmp' }, { c: 'zz' });
	// const z2 = validateObject(o, { a: 'isSafeInteger' }, { c: 'zz' });
	// const z3 = validateObject(o, { test: 'boolean', z: 'bug' });
	// const z4 = validateObject(o, { a: 'boolean', z: 'bug' });

	var ut = /*#__PURE__*/Object.freeze({
		__proto__: null,
		bitGet: bitGet,
		bitLen: bitLen,
		bitMask: bitMask,
		bitSet: bitSet,
		bytesToHex: bytesToHex$1,
		bytesToNumberBE: bytesToNumberBE,
		bytesToNumberLE: bytesToNumberLE,
		concatBytes: concatBytes,
		createHmacDrbg: createHmacDrbg,
		ensureBytes: ensureBytes,
		equalBytes: equalBytes,
		hexToBytes: hexToBytes,
		hexToNumber: hexToNumber,
		numberToBytesBE: numberToBytesBE,
		numberToBytesLE: numberToBytesLE,
		numberToHexUnpadded: numberToHexUnpadded,
		numberToVarBytesBE: numberToVarBytesBE,
		utf8ToBytes: utf8ToBytes$1,
		validateObject: validateObject
	});

	/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
	// Utilities for modular arithmetics and finite fields
	// prettier-ignore
	const _0n$3 = BigInt(0), _1n$3 = BigInt(1), _2n$1 = BigInt(2), _3n$1 = BigInt(3);
	// prettier-ignore
	const _4n = BigInt(4), _5n = BigInt(5), _8n = BigInt(8);
	// prettier-ignore
	BigInt(9); BigInt(16);
	// Calculates a modulo b
	function mod(a, b) {
	    const result = a % b;
	    return result >= _0n$3 ? result : b + result;
	}
	/**
	 * Efficiently raise num to power and do modular division.
	 * Unsafe in some contexts: uses ladder, so can expose bigint bits.
	 * @example
	 * pow(2n, 6n, 11n) // 64n % 11n == 9n
	 */
	// TODO: use field version && remove
	function pow(num, power, modulo) {
	    if (modulo <= _0n$3 || power < _0n$3)
	        throw new Error('Expected power/modulo > 0');
	    if (modulo === _1n$3)
	        return _0n$3;
	    let res = _1n$3;
	    while (power > _0n$3) {
	        if (power & _1n$3)
	            res = (res * num) % modulo;
	        num = (num * num) % modulo;
	        power >>= _1n$3;
	    }
	    return res;
	}
	// Does x ^ (2 ^ power) mod p. pow2(30, 4) == 30 ^ (2 ^ 4)
	function pow2(x, power, modulo) {
	    let res = x;
	    while (power-- > _0n$3) {
	        res *= res;
	        res %= modulo;
	    }
	    return res;
	}
	// Inverses number over modulo
	function invert(number, modulo) {
	    if (number === _0n$3 || modulo <= _0n$3) {
	        throw new Error(`invert: expected positive integers, got n=${number} mod=${modulo}`);
	    }
	    // Euclidean GCD https://brilliant.org/wiki/extended-euclidean-algorithm/
	    // Fermat's little theorem "CT-like" version inv(n) = n^(m-2) mod m is 30x slower.
	    let a = mod(number, modulo);
	    let b = modulo;
	    // prettier-ignore
	    let x = _0n$3, u = _1n$3;
	    while (a !== _0n$3) {
	        // JIT applies optimization if those two lines follow each other
	        const q = b / a;
	        const r = b % a;
	        const m = x - u * q;
	        // prettier-ignore
	        b = a, a = r, x = u, u = m;
	    }
	    const gcd = b;
	    if (gcd !== _1n$3)
	        throw new Error('invert: does not exist');
	    return mod(x, modulo);
	}
	/**
	 * Tonelli-Shanks square root search algorithm.
	 * 1. https://eprint.iacr.org/2012/685.pdf (page 12)
	 * 2. Square Roots from 1; 24, 51, 10 to Dan Shanks
	 * Will start an infinite loop if field order P is not prime.
	 * @param P field order
	 * @returns function that takes field Fp (created from P) and number n
	 */
	function tonelliShanks(P) {
	    // Legendre constant: used to calculate Legendre symbol (a | p),
	    // which denotes the value of a^((p-1)/2) (mod p).
	    // (a | p) ≡ 1    if a is a square (mod p)
	    // (a | p) ≡ -1   if a is not a square (mod p)
	    // (a | p) ≡ 0    if a ≡ 0 (mod p)
	    const legendreC = (P - _1n$3) / _2n$1;
	    let Q, S, Z;
	    // Step 1: By factoring out powers of 2 from p - 1,
	    // find q and s such that p - 1 = q*(2^s) with q odd
	    for (Q = P - _1n$3, S = 0; Q % _2n$1 === _0n$3; Q /= _2n$1, S++)
	        ;
	    // Step 2: Select a non-square z such that (z | p) ≡ -1 and set c ≡ zq
	    for (Z = _2n$1; Z < P && pow(Z, legendreC, P) !== P - _1n$3; Z++)
	        ;
	    // Fast-path
	    if (S === 1) {
	        const p1div4 = (P + _1n$3) / _4n;
	        return function tonelliFast(Fp, n) {
	            const root = Fp.pow(n, p1div4);
	            if (!Fp.eql(Fp.sqr(root), n))
	                throw new Error('Cannot find square root');
	            return root;
	        };
	    }
	    // Slow-path
	    const Q1div2 = (Q + _1n$3) / _2n$1;
	    return function tonelliSlow(Fp, n) {
	        // Step 0: Check that n is indeed a square: (n | p) should not be ≡ -1
	        if (Fp.pow(n, legendreC) === Fp.neg(Fp.ONE))
	            throw new Error('Cannot find square root');
	        let r = S;
	        // TODO: will fail at Fp2/etc
	        let g = Fp.pow(Fp.mul(Fp.ONE, Z), Q); // will update both x and b
	        let x = Fp.pow(n, Q1div2); // first guess at the square root
	        let b = Fp.pow(n, Q); // first guess at the fudge factor
	        while (!Fp.eql(b, Fp.ONE)) {
	            if (Fp.eql(b, Fp.ZERO))
	                return Fp.ZERO; // https://en.wikipedia.org/wiki/Tonelli%E2%80%93Shanks_algorithm (4. If t = 0, return r = 0)
	            // Find m such b^(2^m)==1
	            let m = 1;
	            for (let t2 = Fp.sqr(b); m < r; m++) {
	                if (Fp.eql(t2, Fp.ONE))
	                    break;
	                t2 = Fp.sqr(t2); // t2 *= t2
	            }
	            // NOTE: r-m-1 can be bigger than 32, need to convert to bigint before shift, otherwise there will be overflow
	            const ge = Fp.pow(g, _1n$3 << BigInt(r - m - 1)); // ge = 2^(r-m-1)
	            g = Fp.sqr(ge); // g = ge * ge
	            x = Fp.mul(x, ge); // x *= ge
	            b = Fp.mul(b, g); // b *= g
	            r = m;
	        }
	        return x;
	    };
	}
	function FpSqrt(P) {
	    // NOTE: different algorithms can give different roots, it is up to user to decide which one they want.
	    // For example there is FpSqrtOdd/FpSqrtEven to choice root based on oddness (used for hash-to-curve).
	    // P ≡ 3 (mod 4)
	    // √n = n^((P+1)/4)
	    if (P % _4n === _3n$1) {
	        // Not all roots possible!
	        // const ORDER =
	        //   0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaabn;
	        // const NUM = 72057594037927816n;
	        const p1div4 = (P + _1n$3) / _4n;
	        return function sqrt3mod4(Fp, n) {
	            const root = Fp.pow(n, p1div4);
	            // Throw if root**2 != n
	            if (!Fp.eql(Fp.sqr(root), n))
	                throw new Error('Cannot find square root');
	            return root;
	        };
	    }
	    // Atkin algorithm for q ≡ 5 (mod 8), https://eprint.iacr.org/2012/685.pdf (page 10)
	    if (P % _8n === _5n) {
	        const c1 = (P - _5n) / _8n;
	        return function sqrt5mod8(Fp, n) {
	            const n2 = Fp.mul(n, _2n$1);
	            const v = Fp.pow(n2, c1);
	            const nv = Fp.mul(n, v);
	            const i = Fp.mul(Fp.mul(nv, _2n$1), v);
	            const root = Fp.mul(nv, Fp.sub(i, Fp.ONE));
	            if (!Fp.eql(Fp.sqr(root), n))
	                throw new Error('Cannot find square root');
	            return root;
	        };
	    }
	    // Other cases: Tonelli-Shanks algorithm
	    return tonelliShanks(P);
	}
	// prettier-ignore
	const FIELD_FIELDS = [
	    'create', 'isValid', 'is0', 'neg', 'inv', 'sqrt', 'sqr',
	    'eql', 'add', 'sub', 'mul', 'pow', 'div',
	    'addN', 'subN', 'mulN', 'sqrN'
	];
	function validateField(field) {
	    const initial = {
	        ORDER: 'bigint',
	        MASK: 'bigint',
	        BYTES: 'isSafeInteger',
	        BITS: 'isSafeInteger',
	    };
	    const opts = FIELD_FIELDS.reduce((map, val) => {
	        map[val] = 'function';
	        return map;
	    }, initial);
	    return validateObject(field, opts);
	}
	// Generic field functions
	/**
	 * Same as `pow` but for Fp: non-constant-time.
	 * Unsafe in some contexts: uses ladder, so can expose bigint bits.
	 */
	function FpPow(f, num, power) {
	    // Should have same speed as pow for bigints
	    // TODO: benchmark!
	    if (power < _0n$3)
	        throw new Error('Expected power > 0');
	    if (power === _0n$3)
	        return f.ONE;
	    if (power === _1n$3)
	        return num;
	    let p = f.ONE;
	    let d = num;
	    while (power > _0n$3) {
	        if (power & _1n$3)
	            p = f.mul(p, d);
	        d = f.sqr(d);
	        power >>= _1n$3;
	    }
	    return p;
	}
	/**
	 * Efficiently invert an array of Field elements.
	 * `inv(0)` will return `undefined` here: make sure to throw an error.
	 */
	function FpInvertBatch(f, nums) {
	    const tmp = new Array(nums.length);
	    // Walk from first to last, multiply them by each other MOD p
	    const lastMultiplied = nums.reduce((acc, num, i) => {
	        if (f.is0(num))
	            return acc;
	        tmp[i] = acc;
	        return f.mul(acc, num);
	    }, f.ONE);
	    // Invert last element
	    const inverted = f.inv(lastMultiplied);
	    // Walk from last to first, multiply them by inverted each other MOD p
	    nums.reduceRight((acc, num, i) => {
	        if (f.is0(num))
	            return acc;
	        tmp[i] = f.mul(acc, tmp[i]);
	        return f.mul(acc, num);
	    }, inverted);
	    return tmp;
	}
	// CURVE.n lengths
	function nLength(n, nBitLength) {
	    // Bit size, byte size of CURVE.n
	    const _nBitLength = nBitLength !== undefined ? nBitLength : n.toString(2).length;
	    const nByteLength = Math.ceil(_nBitLength / 8);
	    return { nBitLength: _nBitLength, nByteLength };
	}
	/**
	 * Initializes a finite field over prime. **Non-primes are not supported.**
	 * Do not init in loop: slow. Very fragile: always run a benchmark on a change.
	 * Major performance optimizations:
	 * * a) denormalized operations like mulN instead of mul
	 * * b) same object shape: never add or remove keys
	 * * c) Object.freeze
	 * @param ORDER prime positive bigint
	 * @param bitLen how many bits the field consumes
	 * @param isLE (def: false) if encoding / decoding should be in little-endian
	 * @param redef optional faster redefinitions of sqrt and other methods
	 */
	function Field(ORDER, bitLen, isLE = false, redef = {}) {
	    if (ORDER <= _0n$3)
	        throw new Error(`Expected Field ORDER > 0, got ${ORDER}`);
	    const { nBitLength: BITS, nByteLength: BYTES } = nLength(ORDER, bitLen);
	    if (BYTES > 2048)
	        throw new Error('Field lengths over 2048 bytes are not supported');
	    const sqrtP = FpSqrt(ORDER);
	    const f = Object.freeze({
	        ORDER,
	        BITS,
	        BYTES,
	        MASK: bitMask(BITS),
	        ZERO: _0n$3,
	        ONE: _1n$3,
	        create: (num) => mod(num, ORDER),
	        isValid: (num) => {
	            if (typeof num !== 'bigint')
	                throw new Error(`Invalid field element: expected bigint, got ${typeof num}`);
	            return _0n$3 <= num && num < ORDER; // 0 is valid element, but it's not invertible
	        },
	        is0: (num) => num === _0n$3,
	        isOdd: (num) => (num & _1n$3) === _1n$3,
	        neg: (num) => mod(-num, ORDER),
	        eql: (lhs, rhs) => lhs === rhs,
	        sqr: (num) => mod(num * num, ORDER),
	        add: (lhs, rhs) => mod(lhs + rhs, ORDER),
	        sub: (lhs, rhs) => mod(lhs - rhs, ORDER),
	        mul: (lhs, rhs) => mod(lhs * rhs, ORDER),
	        pow: (num, power) => FpPow(f, num, power),
	        div: (lhs, rhs) => mod(lhs * invert(rhs, ORDER), ORDER),
	        // Same as above, but doesn't normalize
	        sqrN: (num) => num * num,
	        addN: (lhs, rhs) => lhs + rhs,
	        subN: (lhs, rhs) => lhs - rhs,
	        mulN: (lhs, rhs) => lhs * rhs,
	        inv: (num) => invert(num, ORDER),
	        sqrt: redef.sqrt || ((n) => sqrtP(f, n)),
	        invertBatch: (lst) => FpInvertBatch(f, lst),
	        // TODO: do we really need constant cmov?
	        // We don't have const-time bigints anyway, so probably will be not very useful
	        cmov: (a, b, c) => (c ? b : a),
	        toBytes: (num) => (isLE ? numberToBytesLE(num, BYTES) : numberToBytesBE(num, BYTES)),
	        fromBytes: (bytes) => {
	            if (bytes.length !== BYTES)
	                throw new Error(`Fp.fromBytes: expected ${BYTES}, got ${bytes.length}`);
	            return isLE ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
	        },
	    });
	    return Object.freeze(f);
	}
	/**
	 * Returns total number of bytes consumed by the field element.
	 * For example, 32 bytes for usual 256-bit weierstrass curve.
	 * @param fieldOrder number of field elements, usually CURVE.n
	 * @returns byte length of field
	 */
	function getFieldBytesLength(fieldOrder) {
	    if (typeof fieldOrder !== 'bigint')
	        throw new Error('field order must be bigint');
	    const bitLength = fieldOrder.toString(2).length;
	    return Math.ceil(bitLength / 8);
	}
	/**
	 * Returns minimal amount of bytes that can be safely reduced
	 * by field order.
	 * Should be 2^-128 for 128-bit curve such as P256.
	 * @param fieldOrder number of field elements, usually CURVE.n
	 * @returns byte length of target hash
	 */
	function getMinHashLength(fieldOrder) {
	    const length = getFieldBytesLength(fieldOrder);
	    return length + Math.ceil(length / 2);
	}
	/**
	 * "Constant-time" private key generation utility.
	 * Can take (n + n/2) or more bytes of uniform input e.g. from CSPRNG or KDF
	 * and convert them into private scalar, with the modulo bias being negligible.
	 * Needs at least 48 bytes of input for 32-byte private key.
	 * https://research.kudelskisecurity.com/2020/07/28/the-definitive-guide-to-modulo-bias-and-how-to-avoid-it/
	 * FIPS 186-5, A.2 https://csrc.nist.gov/publications/detail/fips/186/5/final
	 * RFC 9380, https://www.rfc-editor.org/rfc/rfc9380#section-5
	 * @param hash hash output from SHA3 or a similar function
	 * @param groupOrder size of subgroup - (e.g. secp256k1.CURVE.n)
	 * @param isLE interpret hash bytes as LE num
	 * @returns valid private scalar
	 */
	function mapHashToField(key, fieldOrder, isLE = false) {
	    const len = key.length;
	    const fieldLen = getFieldBytesLength(fieldOrder);
	    const minLen = getMinHashLength(fieldOrder);
	    // No small numbers: need to understand bias story. No huge numbers: easier to detect JS timings.
	    if (len < 16 || len < minLen || len > 1024)
	        throw new Error(`expected ${minLen}-1024 bytes of input, got ${len}`);
	    const num = isLE ? bytesToNumberBE(key) : bytesToNumberLE(key);
	    // `mod(x, 11)` can sometimes produce 0. `mod(x, 10) + 1` is the same, but no 0
	    const reduced = mod(num, fieldOrder - _1n$3) + _1n$3;
	    return isLE ? numberToBytesLE(reduced, fieldLen) : numberToBytesBE(reduced, fieldLen);
	}

	/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
	// Abelian group utilities
	const _0n$2 = BigInt(0);
	const _1n$2 = BigInt(1);
	// Elliptic curve multiplication of Point by scalar. Fragile.
	// Scalars should always be less than curve order: this should be checked inside of a curve itself.
	// Creates precomputation tables for fast multiplication:
	// - private scalar is split by fixed size windows of W bits
	// - every window point is collected from window's table & added to accumulator
	// - since windows are different, same point inside tables won't be accessed more than once per calc
	// - each multiplication is 'Math.ceil(CURVE_ORDER / 𝑊) + 1' point additions (fixed for any scalar)
	// - +1 window is neccessary for wNAF
	// - wNAF reduces table size: 2x less memory + 2x faster generation, but 10% slower multiplication
	// TODO: Research returning 2d JS array of windows, instead of a single window. This would allow
	// windows to be in different memory locations
	function wNAF(c, bits) {
	    const constTimeNegate = (condition, item) => {
	        const neg = item.negate();
	        return condition ? neg : item;
	    };
	    const opts = (W) => {
	        const windows = Math.ceil(bits / W) + 1; // +1, because
	        const windowSize = 2 ** (W - 1); // -1 because we skip zero
	        return { windows, windowSize };
	    };
	    return {
	        constTimeNegate,
	        // non-const time multiplication ladder
	        unsafeLadder(elm, n) {
	            let p = c.ZERO;
	            let d = elm;
	            while (n > _0n$2) {
	                if (n & _1n$2)
	                    p = p.add(d);
	                d = d.double();
	                n >>= _1n$2;
	            }
	            return p;
	        },
	        /**
	         * Creates a wNAF precomputation window. Used for caching.
	         * Default window size is set by `utils.precompute()` and is equal to 8.
	         * Number of precomputed points depends on the curve size:
	         * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
	         * - 𝑊 is the window size
	         * - 𝑛 is the bitlength of the curve order.
	         * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
	         * @returns precomputed point tables flattened to a single array
	         */
	        precomputeWindow(elm, W) {
	            const { windows, windowSize } = opts(W);
	            const points = [];
	            let p = elm;
	            let base = p;
	            for (let window = 0; window < windows; window++) {
	                base = p;
	                points.push(base);
	                // =1, because we skip zero
	                for (let i = 1; i < windowSize; i++) {
	                    base = base.add(p);
	                    points.push(base);
	                }
	                p = base.double();
	            }
	            return points;
	        },
	        /**
	         * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
	         * @param W window size
	         * @param precomputes precomputed tables
	         * @param n scalar (we don't check here, but should be less than curve order)
	         * @returns real and fake (for const-time) points
	         */
	        wNAF(W, precomputes, n) {
	            // TODO: maybe check that scalar is less than group order? wNAF behavious is undefined otherwise
	            // But need to carefully remove other checks before wNAF. ORDER == bits here
	            const { windows, windowSize } = opts(W);
	            let p = c.ZERO;
	            let f = c.BASE;
	            const mask = BigInt(2 ** W - 1); // Create mask with W ones: 0b1111 for W=4 etc.
	            const maxNumber = 2 ** W;
	            const shiftBy = BigInt(W);
	            for (let window = 0; window < windows; window++) {
	                const offset = window * windowSize;
	                // Extract W bits.
	                let wbits = Number(n & mask);
	                // Shift number by W bits.
	                n >>= shiftBy;
	                // If the bits are bigger than max size, we'll split those.
	                // +224 => 256 - 32
	                if (wbits > windowSize) {
	                    wbits -= maxNumber;
	                    n += _1n$2;
	                }
	                // This code was first written with assumption that 'f' and 'p' will never be infinity point:
	                // since each addition is multiplied by 2 ** W, it cannot cancel each other. However,
	                // there is negate now: it is possible that negated element from low value
	                // would be the same as high element, which will create carry into next window.
	                // It's not obvious how this can fail, but still worth investigating later.
	                // Check if we're onto Zero point.
	                // Add random point inside current window to f.
	                const offset1 = offset;
	                const offset2 = offset + Math.abs(wbits) - 1; // -1 because we skip zero
	                const cond1 = window % 2 !== 0;
	                const cond2 = wbits < 0;
	                if (wbits === 0) {
	                    // The most important part for const-time getPublicKey
	                    f = f.add(constTimeNegate(cond1, precomputes[offset1]));
	                }
	                else {
	                    p = p.add(constTimeNegate(cond2, precomputes[offset2]));
	                }
	            }
	            // JIT-compiler should not eliminate f here, since it will later be used in normalizeZ()
	            // Even if the variable is still unused, there are some checks which will
	            // throw an exception, so compiler needs to prove they won't happen, which is hard.
	            // At this point there is a way to F be infinity-point even if p is not,
	            // which makes it less const-time: around 1 bigint multiply.
	            return { p, f };
	        },
	        wNAFCached(P, precomputesMap, n, transform) {
	            // @ts-ignore
	            const W = P._WINDOW_SIZE || 1;
	            // Calculate precomputes on a first run, reuse them after
	            let comp = precomputesMap.get(P);
	            if (!comp) {
	                comp = this.precomputeWindow(P, W);
	                if (W !== 1) {
	                    precomputesMap.set(P, transform(comp));
	                }
	            }
	            return this.wNAF(W, comp, n);
	        },
	    };
	}
	function validateBasic(curve) {
	    validateField(curve.Fp);
	    validateObject(curve, {
	        n: 'bigint',
	        h: 'bigint',
	        Gx: 'field',
	        Gy: 'field',
	    }, {
	        nBitLength: 'isSafeInteger',
	        nByteLength: 'isSafeInteger',
	    });
	    // Set defaults
	    return Object.freeze({
	        ...nLength(curve.n, curve.nBitLength),
	        ...curve,
	        ...{ p: curve.Fp.ORDER },
	    });
	}

	/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
	// Short Weierstrass curve. The formula is: y² = x³ + ax + b
	function validatePointOpts(curve) {
	    const opts = validateBasic(curve);
	    validateObject(opts, {
	        a: 'field',
	        b: 'field',
	    }, {
	        allowedPrivateKeyLengths: 'array',
	        wrapPrivateKey: 'boolean',
	        isTorsionFree: 'function',
	        clearCofactor: 'function',
	        allowInfinityPoint: 'boolean',
	        fromBytes: 'function',
	        toBytes: 'function',
	    });
	    const { endo, Fp, a } = opts;
	    if (endo) {
	        if (!Fp.eql(a, Fp.ZERO)) {
	            throw new Error('Endomorphism can only be defined for Koblitz curves that have a=0');
	        }
	        if (typeof endo !== 'object' ||
	            typeof endo.beta !== 'bigint' ||
	            typeof endo.splitScalar !== 'function') {
	            throw new Error('Expected endomorphism with beta: bigint and splitScalar: function');
	        }
	    }
	    return Object.freeze({ ...opts });
	}
	// ASN.1 DER encoding utilities
	const { bytesToNumberBE: b2n, hexToBytes: h2b } = ut;
	const DER = {
	    // asn.1 DER encoding utils
	    Err: class DERErr extends Error {
	        constructor(m = '') {
	            super(m);
	        }
	    },
	    _parseInt(data) {
	        const { Err: E } = DER;
	        if (data.length < 2 || data[0] !== 0x02)
	            throw new E('Invalid signature integer tag');
	        const len = data[1];
	        const res = data.subarray(2, len + 2);
	        if (!len || res.length !== len)
	            throw new E('Invalid signature integer: wrong length');
	        // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
	        // since we always use positive integers here. It must always be empty:
	        // - add zero byte if exists
	        // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
	        if (res[0] & 0b10000000)
	            throw new E('Invalid signature integer: negative');
	        if (res[0] === 0x00 && !(res[1] & 0b10000000))
	            throw new E('Invalid signature integer: unnecessary leading zero');
	        return { d: b2n(res), l: data.subarray(len + 2) }; // d is data, l is left
	    },
	    toSig(hex) {
	        // parse DER signature
	        const { Err: E } = DER;
	        const data = typeof hex === 'string' ? h2b(hex) : hex;
	        if (!(data instanceof Uint8Array))
	            throw new Error('ui8a expected');
	        let l = data.length;
	        if (l < 2 || data[0] != 0x30)
	            throw new E('Invalid signature tag');
	        if (data[1] !== l - 2)
	            throw new E('Invalid signature: incorrect length');
	        const { d: r, l: sBytes } = DER._parseInt(data.subarray(2));
	        const { d: s, l: rBytesLeft } = DER._parseInt(sBytes);
	        if (rBytesLeft.length)
	            throw new E('Invalid signature: left bytes after parsing');
	        return { r, s };
	    },
	    hexFromSig(sig) {
	        // Add leading zero if first byte has negative bit enabled. More details in '_parseInt'
	        const slice = (s) => (Number.parseInt(s[0], 16) & 0b1000 ? '00' + s : s);
	        const h = (num) => {
	            const hex = num.toString(16);
	            return hex.length & 1 ? `0${hex}` : hex;
	        };
	        const s = slice(h(sig.s));
	        const r = slice(h(sig.r));
	        const shl = s.length / 2;
	        const rhl = r.length / 2;
	        const sl = h(shl);
	        const rl = h(rhl);
	        return `30${h(rhl + shl + 4)}02${rl}${r}02${sl}${s}`;
	    },
	};
	// Be friendly to bad ECMAScript parsers by not using bigint literals
	// prettier-ignore
	const _0n$1 = BigInt(0), _1n$1 = BigInt(1); BigInt(2); const _3n = BigInt(3); BigInt(4);
	function weierstrassPoints(opts) {
	    const CURVE = validatePointOpts(opts);
	    const { Fp } = CURVE; // All curves has same field / group length as for now, but they can differ
	    const toBytes = CURVE.toBytes ||
	        ((_c, point, _isCompressed) => {
	            const a = point.toAffine();
	            return concatBytes(Uint8Array.from([0x04]), Fp.toBytes(a.x), Fp.toBytes(a.y));
	        });
	    const fromBytes = CURVE.fromBytes ||
	        ((bytes) => {
	            // const head = bytes[0];
	            const tail = bytes.subarray(1);
	            // if (head !== 0x04) throw new Error('Only non-compressed encoding is supported');
	            const x = Fp.fromBytes(tail.subarray(0, Fp.BYTES));
	            const y = Fp.fromBytes(tail.subarray(Fp.BYTES, 2 * Fp.BYTES));
	            return { x, y };
	        });
	    /**
	     * y² = x³ + ax + b: Short weierstrass curve formula
	     * @returns y²
	     */
	    function weierstrassEquation(x) {
	        const { a, b } = CURVE;
	        const x2 = Fp.sqr(x); // x * x
	        const x3 = Fp.mul(x2, x); // x2 * x
	        return Fp.add(Fp.add(x3, Fp.mul(x, a)), b); // x3 + a * x + b
	    }
	    // Validate whether the passed curve params are valid.
	    // We check if curve equation works for generator point.
	    // `assertValidity()` won't work: `isTorsionFree()` is not available at this point in bls12-381.
	    // ProjectivePoint class has not been initialized yet.
	    if (!Fp.eql(Fp.sqr(CURVE.Gy), weierstrassEquation(CURVE.Gx)))
	        throw new Error('bad generator point: equation left != right');
	    // Valid group elements reside in range 1..n-1
	    function isWithinCurveOrder(num) {
	        return typeof num === 'bigint' && _0n$1 < num && num < CURVE.n;
	    }
	    function assertGE(num) {
	        if (!isWithinCurveOrder(num))
	            throw new Error('Expected valid bigint: 0 < bigint < curve.n');
	    }
	    // Validates if priv key is valid and converts it to bigint.
	    // Supports options allowedPrivateKeyLengths and wrapPrivateKey.
	    function normPrivateKeyToScalar(key) {
	        const { allowedPrivateKeyLengths: lengths, nByteLength, wrapPrivateKey, n } = CURVE;
	        if (lengths && typeof key !== 'bigint') {
	            if (key instanceof Uint8Array)
	                key = bytesToHex$1(key);
	            // Normalize to hex string, pad. E.g. P521 would norm 130-132 char hex to 132-char bytes
	            if (typeof key !== 'string' || !lengths.includes(key.length))
	                throw new Error('Invalid key');
	            key = key.padStart(nByteLength * 2, '0');
	        }
	        let num;
	        try {
	            num =
	                typeof key === 'bigint'
	                    ? key
	                    : bytesToNumberBE(ensureBytes('private key', key, nByteLength));
	        }
	        catch (error) {
	            throw new Error(`private key must be ${nByteLength} bytes, hex or bigint, not ${typeof key}`);
	        }
	        if (wrapPrivateKey)
	            num = mod(num, n); // disabled by default, enabled for BLS
	        assertGE(num); // num in range [1..N-1]
	        return num;
	    }
	    const pointPrecomputes = new Map();
	    function assertPrjPoint(other) {
	        if (!(other instanceof Point))
	            throw new Error('ProjectivePoint expected');
	    }
	    /**
	     * Projective Point works in 3d / projective (homogeneous) coordinates: (x, y, z) ∋ (x=x/z, y=y/z)
	     * Default Point works in 2d / affine coordinates: (x, y)
	     * We're doing calculations in projective, because its operations don't require costly inversion.
	     */
	    class Point {
	        constructor(px, py, pz) {
	            this.px = px;
	            this.py = py;
	            this.pz = pz;
	            if (px == null || !Fp.isValid(px))
	                throw new Error('x required');
	            if (py == null || !Fp.isValid(py))
	                throw new Error('y required');
	            if (pz == null || !Fp.isValid(pz))
	                throw new Error('z required');
	        }
	        // Does not validate if the point is on-curve.
	        // Use fromHex instead, or call assertValidity() later.
	        static fromAffine(p) {
	            const { x, y } = p || {};
	            if (!p || !Fp.isValid(x) || !Fp.isValid(y))
	                throw new Error('invalid affine point');
	            if (p instanceof Point)
	                throw new Error('projective point not allowed');
	            const is0 = (i) => Fp.eql(i, Fp.ZERO);
	            // fromAffine(x:0, y:0) would produce (x:0, y:0, z:1), but we need (x:0, y:1, z:0)
	            if (is0(x) && is0(y))
	                return Point.ZERO;
	            return new Point(x, y, Fp.ONE);
	        }
	        get x() {
	            return this.toAffine().x;
	        }
	        get y() {
	            return this.toAffine().y;
	        }
	        /**
	         * Takes a bunch of Projective Points but executes only one
	         * inversion on all of them. Inversion is very slow operation,
	         * so this improves performance massively.
	         * Optimization: converts a list of projective points to a list of identical points with Z=1.
	         */
	        static normalizeZ(points) {
	            const toInv = Fp.invertBatch(points.map((p) => p.pz));
	            return points.map((p, i) => p.toAffine(toInv[i])).map(Point.fromAffine);
	        }
	        /**
	         * Converts hash string or Uint8Array to Point.
	         * @param hex short/long ECDSA hex
	         */
	        static fromHex(hex) {
	            const P = Point.fromAffine(fromBytes(ensureBytes('pointHex', hex)));
	            P.assertValidity();
	            return P;
	        }
	        // Multiplies generator point by privateKey.
	        static fromPrivateKey(privateKey) {
	            return Point.BASE.multiply(normPrivateKeyToScalar(privateKey));
	        }
	        // "Private method", don't use it directly
	        _setWindowSize(windowSize) {
	            this._WINDOW_SIZE = windowSize;
	            pointPrecomputes.delete(this);
	        }
	        // A point on curve is valid if it conforms to equation.
	        assertValidity() {
	            if (this.is0()) {
	                // (0, 1, 0) aka ZERO is invalid in most contexts.
	                // In BLS, ZERO can be serialized, so we allow it.
	                // (0, 0, 0) is wrong representation of ZERO and is always invalid.
	                if (CURVE.allowInfinityPoint && !Fp.is0(this.py))
	                    return;
	                throw new Error('bad point: ZERO');
	            }
	            // Some 3rd-party test vectors require different wording between here & `fromCompressedHex`
	            const { x, y } = this.toAffine();
	            // Check if x, y are valid field elements
	            if (!Fp.isValid(x) || !Fp.isValid(y))
	                throw new Error('bad point: x or y not FE');
	            const left = Fp.sqr(y); // y²
	            const right = weierstrassEquation(x); // x³ + ax + b
	            if (!Fp.eql(left, right))
	                throw new Error('bad point: equation left != right');
	            if (!this.isTorsionFree())
	                throw new Error('bad point: not in prime-order subgroup');
	        }
	        hasEvenY() {
	            const { y } = this.toAffine();
	            if (Fp.isOdd)
	                return !Fp.isOdd(y);
	            throw new Error("Field doesn't support isOdd");
	        }
	        /**
	         * Compare one point to another.
	         */
	        equals(other) {
	            assertPrjPoint(other);
	            const { px: X1, py: Y1, pz: Z1 } = this;
	            const { px: X2, py: Y2, pz: Z2 } = other;
	            const U1 = Fp.eql(Fp.mul(X1, Z2), Fp.mul(X2, Z1));
	            const U2 = Fp.eql(Fp.mul(Y1, Z2), Fp.mul(Y2, Z1));
	            return U1 && U2;
	        }
	        /**
	         * Flips point to one corresponding to (x, -y) in Affine coordinates.
	         */
	        negate() {
	            return new Point(this.px, Fp.neg(this.py), this.pz);
	        }
	        // Renes-Costello-Batina exception-free doubling formula.
	        // There is 30% faster Jacobian formula, but it is not complete.
	        // https://eprint.iacr.org/2015/1060, algorithm 3
	        // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
	        double() {
	            const { a, b } = CURVE;
	            const b3 = Fp.mul(b, _3n);
	            const { px: X1, py: Y1, pz: Z1 } = this;
	            let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO; // prettier-ignore
	            let t0 = Fp.mul(X1, X1); // step 1
	            let t1 = Fp.mul(Y1, Y1);
	            let t2 = Fp.mul(Z1, Z1);
	            let t3 = Fp.mul(X1, Y1);
	            t3 = Fp.add(t3, t3); // step 5
	            Z3 = Fp.mul(X1, Z1);
	            Z3 = Fp.add(Z3, Z3);
	            X3 = Fp.mul(a, Z3);
	            Y3 = Fp.mul(b3, t2);
	            Y3 = Fp.add(X3, Y3); // step 10
	            X3 = Fp.sub(t1, Y3);
	            Y3 = Fp.add(t1, Y3);
	            Y3 = Fp.mul(X3, Y3);
	            X3 = Fp.mul(t3, X3);
	            Z3 = Fp.mul(b3, Z3); // step 15
	            t2 = Fp.mul(a, t2);
	            t3 = Fp.sub(t0, t2);
	            t3 = Fp.mul(a, t3);
	            t3 = Fp.add(t3, Z3);
	            Z3 = Fp.add(t0, t0); // step 20
	            t0 = Fp.add(Z3, t0);
	            t0 = Fp.add(t0, t2);
	            t0 = Fp.mul(t0, t3);
	            Y3 = Fp.add(Y3, t0);
	            t2 = Fp.mul(Y1, Z1); // step 25
	            t2 = Fp.add(t2, t2);
	            t0 = Fp.mul(t2, t3);
	            X3 = Fp.sub(X3, t0);
	            Z3 = Fp.mul(t2, t1);
	            Z3 = Fp.add(Z3, Z3); // step 30
	            Z3 = Fp.add(Z3, Z3);
	            return new Point(X3, Y3, Z3);
	        }
	        // Renes-Costello-Batina exception-free addition formula.
	        // There is 30% faster Jacobian formula, but it is not complete.
	        // https://eprint.iacr.org/2015/1060, algorithm 1
	        // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
	        add(other) {
	            assertPrjPoint(other);
	            const { px: X1, py: Y1, pz: Z1 } = this;
	            const { px: X2, py: Y2, pz: Z2 } = other;
	            let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO; // prettier-ignore
	            const a = CURVE.a;
	            const b3 = Fp.mul(CURVE.b, _3n);
	            let t0 = Fp.mul(X1, X2); // step 1
	            let t1 = Fp.mul(Y1, Y2);
	            let t2 = Fp.mul(Z1, Z2);
	            let t3 = Fp.add(X1, Y1);
	            let t4 = Fp.add(X2, Y2); // step 5
	            t3 = Fp.mul(t3, t4);
	            t4 = Fp.add(t0, t1);
	            t3 = Fp.sub(t3, t4);
	            t4 = Fp.add(X1, Z1);
	            let t5 = Fp.add(X2, Z2); // step 10
	            t4 = Fp.mul(t4, t5);
	            t5 = Fp.add(t0, t2);
	            t4 = Fp.sub(t4, t5);
	            t5 = Fp.add(Y1, Z1);
	            X3 = Fp.add(Y2, Z2); // step 15
	            t5 = Fp.mul(t5, X3);
	            X3 = Fp.add(t1, t2);
	            t5 = Fp.sub(t5, X3);
	            Z3 = Fp.mul(a, t4);
	            X3 = Fp.mul(b3, t2); // step 20
	            Z3 = Fp.add(X3, Z3);
	            X3 = Fp.sub(t1, Z3);
	            Z3 = Fp.add(t1, Z3);
	            Y3 = Fp.mul(X3, Z3);
	            t1 = Fp.add(t0, t0); // step 25
	            t1 = Fp.add(t1, t0);
	            t2 = Fp.mul(a, t2);
	            t4 = Fp.mul(b3, t4);
	            t1 = Fp.add(t1, t2);
	            t2 = Fp.sub(t0, t2); // step 30
	            t2 = Fp.mul(a, t2);
	            t4 = Fp.add(t4, t2);
	            t0 = Fp.mul(t1, t4);
	            Y3 = Fp.add(Y3, t0);
	            t0 = Fp.mul(t5, t4); // step 35
	            X3 = Fp.mul(t3, X3);
	            X3 = Fp.sub(X3, t0);
	            t0 = Fp.mul(t3, t1);
	            Z3 = Fp.mul(t5, Z3);
	            Z3 = Fp.add(Z3, t0); // step 40
	            return new Point(X3, Y3, Z3);
	        }
	        subtract(other) {
	            return this.add(other.negate());
	        }
	        is0() {
	            return this.equals(Point.ZERO);
	        }
	        wNAF(n) {
	            return wnaf.wNAFCached(this, pointPrecomputes, n, (comp) => {
	                const toInv = Fp.invertBatch(comp.map((p) => p.pz));
	                return comp.map((p, i) => p.toAffine(toInv[i])).map(Point.fromAffine);
	            });
	        }
	        /**
	         * Non-constant-time multiplication. Uses double-and-add algorithm.
	         * It's faster, but should only be used when you don't care about
	         * an exposed private key e.g. sig verification, which works over *public* keys.
	         */
	        multiplyUnsafe(n) {
	            const I = Point.ZERO;
	            if (n === _0n$1)
	                return I;
	            assertGE(n); // Will throw on 0
	            if (n === _1n$1)
	                return this;
	            const { endo } = CURVE;
	            if (!endo)
	                return wnaf.unsafeLadder(this, n);
	            // Apply endomorphism
	            let { k1neg, k1, k2neg, k2 } = endo.splitScalar(n);
	            let k1p = I;
	            let k2p = I;
	            let d = this;
	            while (k1 > _0n$1 || k2 > _0n$1) {
	                if (k1 & _1n$1)
	                    k1p = k1p.add(d);
	                if (k2 & _1n$1)
	                    k2p = k2p.add(d);
	                d = d.double();
	                k1 >>= _1n$1;
	                k2 >>= _1n$1;
	            }
	            if (k1neg)
	                k1p = k1p.negate();
	            if (k2neg)
	                k2p = k2p.negate();
	            k2p = new Point(Fp.mul(k2p.px, endo.beta), k2p.py, k2p.pz);
	            return k1p.add(k2p);
	        }
	        /**
	         * Constant time multiplication.
	         * Uses wNAF method. Windowed method may be 10% faster,
	         * but takes 2x longer to generate and consumes 2x memory.
	         * Uses precomputes when available.
	         * Uses endomorphism for Koblitz curves.
	         * @param scalar by which the point would be multiplied
	         * @returns New point
	         */
	        multiply(scalar) {
	            assertGE(scalar);
	            let n = scalar;
	            let point, fake; // Fake point is used to const-time mult
	            const { endo } = CURVE;
	            if (endo) {
	                const { k1neg, k1, k2neg, k2 } = endo.splitScalar(n);
	                let { p: k1p, f: f1p } = this.wNAF(k1);
	                let { p: k2p, f: f2p } = this.wNAF(k2);
	                k1p = wnaf.constTimeNegate(k1neg, k1p);
	                k2p = wnaf.constTimeNegate(k2neg, k2p);
	                k2p = new Point(Fp.mul(k2p.px, endo.beta), k2p.py, k2p.pz);
	                point = k1p.add(k2p);
	                fake = f1p.add(f2p);
	            }
	            else {
	                const { p, f } = this.wNAF(n);
	                point = p;
	                fake = f;
	            }
	            // Normalize `z` for both points, but return only real one
	            return Point.normalizeZ([point, fake])[0];
	        }
	        /**
	         * Efficiently calculate `aP + bQ`. Unsafe, can expose private key, if used incorrectly.
	         * Not using Strauss-Shamir trick: precomputation tables are faster.
	         * The trick could be useful if both P and Q are not G (not in our case).
	         * @returns non-zero affine point
	         */
	        multiplyAndAddUnsafe(Q, a, b) {
	            const G = Point.BASE; // No Strauss-Shamir trick: we have 10% faster G precomputes
	            const mul = (P, a // Select faster multiply() method
	            ) => (a === _0n$1 || a === _1n$1 || !P.equals(G) ? P.multiplyUnsafe(a) : P.multiply(a));
	            const sum = mul(this, a).add(mul(Q, b));
	            return sum.is0() ? undefined : sum;
	        }
	        // Converts Projective point to affine (x, y) coordinates.
	        // Can accept precomputed Z^-1 - for example, from invertBatch.
	        // (x, y, z) ∋ (x=x/z, y=y/z)
	        toAffine(iz) {
	            const { px: x, py: y, pz: z } = this;
	            const is0 = this.is0();
	            // If invZ was 0, we return zero point. However we still want to execute
	            // all operations, so we replace invZ with a random number, 1.
	            if (iz == null)
	                iz = is0 ? Fp.ONE : Fp.inv(z);
	            const ax = Fp.mul(x, iz);
	            const ay = Fp.mul(y, iz);
	            const zz = Fp.mul(z, iz);
	            if (is0)
	                return { x: Fp.ZERO, y: Fp.ZERO };
	            if (!Fp.eql(zz, Fp.ONE))
	                throw new Error('invZ was invalid');
	            return { x: ax, y: ay };
	        }
	        isTorsionFree() {
	            const { h: cofactor, isTorsionFree } = CURVE;
	            if (cofactor === _1n$1)
	                return true; // No subgroups, always torsion-free
	            if (isTorsionFree)
	                return isTorsionFree(Point, this);
	            throw new Error('isTorsionFree() has not been declared for the elliptic curve');
	        }
	        clearCofactor() {
	            const { h: cofactor, clearCofactor } = CURVE;
	            if (cofactor === _1n$1)
	                return this; // Fast-path
	            if (clearCofactor)
	                return clearCofactor(Point, this);
	            return this.multiplyUnsafe(CURVE.h);
	        }
	        toRawBytes(isCompressed = true) {
	            this.assertValidity();
	            return toBytes(Point, this, isCompressed);
	        }
	        toHex(isCompressed = true) {
	            return bytesToHex$1(this.toRawBytes(isCompressed));
	        }
	    }
	    Point.BASE = new Point(CURVE.Gx, CURVE.Gy, Fp.ONE);
	    Point.ZERO = new Point(Fp.ZERO, Fp.ONE, Fp.ZERO);
	    const _bits = CURVE.nBitLength;
	    const wnaf = wNAF(Point, CURVE.endo ? Math.ceil(_bits / 2) : _bits);
	    // Validate if generator point is on curve
	    return {
	        CURVE,
	        ProjectivePoint: Point,
	        normPrivateKeyToScalar,
	        weierstrassEquation,
	        isWithinCurveOrder,
	    };
	}
	function validateOpts(curve) {
	    const opts = validateBasic(curve);
	    validateObject(opts, {
	        hash: 'hash',
	        hmac: 'function',
	        randomBytes: 'function',
	    }, {
	        bits2int: 'function',
	        bits2int_modN: 'function',
	        lowS: 'boolean',
	    });
	    return Object.freeze({ lowS: true, ...opts });
	}
	function weierstrass(curveDef) {
	    const CURVE = validateOpts(curveDef);
	    const { Fp, n: CURVE_ORDER } = CURVE;
	    const compressedLen = Fp.BYTES + 1; // e.g. 33 for 32
	    const uncompressedLen = 2 * Fp.BYTES + 1; // e.g. 65 for 32
	    function isValidFieldElement(num) {
	        return _0n$1 < num && num < Fp.ORDER; // 0 is banned since it's not invertible FE
	    }
	    function modN(a) {
	        return mod(a, CURVE_ORDER);
	    }
	    function invN(a) {
	        return invert(a, CURVE_ORDER);
	    }
	    const { ProjectivePoint: Point, normPrivateKeyToScalar, weierstrassEquation, isWithinCurveOrder, } = weierstrassPoints({
	        ...CURVE,
	        toBytes(_c, point, isCompressed) {
	            const a = point.toAffine();
	            const x = Fp.toBytes(a.x);
	            const cat = concatBytes;
	            if (isCompressed) {
	                return cat(Uint8Array.from([point.hasEvenY() ? 0x02 : 0x03]), x);
	            }
	            else {
	                return cat(Uint8Array.from([0x04]), x, Fp.toBytes(a.y));
	            }
	        },
	        fromBytes(bytes) {
	            const len = bytes.length;
	            const head = bytes[0];
	            const tail = bytes.subarray(1);
	            // this.assertValidity() is done inside of fromHex
	            if (len === compressedLen && (head === 0x02 || head === 0x03)) {
	                const x = bytesToNumberBE(tail);
	                if (!isValidFieldElement(x))
	                    throw new Error('Point is not on curve');
	                const y2 = weierstrassEquation(x); // y² = x³ + ax + b
	                let y = Fp.sqrt(y2); // y = y² ^ (p+1)/4
	                const isYOdd = (y & _1n$1) === _1n$1;
	                // ECDSA
	                const isHeadOdd = (head & 1) === 1;
	                if (isHeadOdd !== isYOdd)
	                    y = Fp.neg(y);
	                return { x, y };
	            }
	            else if (len === uncompressedLen && head === 0x04) {
	                const x = Fp.fromBytes(tail.subarray(0, Fp.BYTES));
	                const y = Fp.fromBytes(tail.subarray(Fp.BYTES, 2 * Fp.BYTES));
	                return { x, y };
	            }
	            else {
	                throw new Error(`Point of length ${len} was invalid. Expected ${compressedLen} compressed bytes or ${uncompressedLen} uncompressed bytes`);
	            }
	        },
	    });
	    const numToNByteStr = (num) => bytesToHex$1(numberToBytesBE(num, CURVE.nByteLength));
	    function isBiggerThanHalfOrder(number) {
	        const HALF = CURVE_ORDER >> _1n$1;
	        return number > HALF;
	    }
	    function normalizeS(s) {
	        return isBiggerThanHalfOrder(s) ? modN(-s) : s;
	    }
	    // slice bytes num
	    const slcNum = (b, from, to) => bytesToNumberBE(b.slice(from, to));
	    /**
	     * ECDSA signature with its (r, s) properties. Supports DER & compact representations.
	     */
	    class Signature {
	        constructor(r, s, recovery) {
	            this.r = r;
	            this.s = s;
	            this.recovery = recovery;
	            this.assertValidity();
	        }
	        // pair (bytes of r, bytes of s)
	        static fromCompact(hex) {
	            const l = CURVE.nByteLength;
	            hex = ensureBytes('compactSignature', hex, l * 2);
	            return new Signature(slcNum(hex, 0, l), slcNum(hex, l, 2 * l));
	        }
	        // DER encoded ECDSA signature
	        // https://bitcoin.stackexchange.com/questions/57644/what-are-the-parts-of-a-bitcoin-transaction-input-script
	        static fromDER(hex) {
	            const { r, s } = DER.toSig(ensureBytes('DER', hex));
	            return new Signature(r, s);
	        }
	        assertValidity() {
	            // can use assertGE here
	            if (!isWithinCurveOrder(this.r))
	                throw new Error('r must be 0 < r < CURVE.n');
	            if (!isWithinCurveOrder(this.s))
	                throw new Error('s must be 0 < s < CURVE.n');
	        }
	        addRecoveryBit(recovery) {
	            return new Signature(this.r, this.s, recovery);
	        }
	        recoverPublicKey(msgHash) {
	            const { r, s, recovery: rec } = this;
	            const h = bits2int_modN(ensureBytes('msgHash', msgHash)); // Truncate hash
	            if (rec == null || ![0, 1, 2, 3].includes(rec))
	                throw new Error('recovery id invalid');
	            const radj = rec === 2 || rec === 3 ? r + CURVE.n : r;
	            if (radj >= Fp.ORDER)
	                throw new Error('recovery id 2 or 3 invalid');
	            const prefix = (rec & 1) === 0 ? '02' : '03';
	            const R = Point.fromHex(prefix + numToNByteStr(radj));
	            const ir = invN(radj); // r^-1
	            const u1 = modN(-h * ir); // -hr^-1
	            const u2 = modN(s * ir); // sr^-1
	            const Q = Point.BASE.multiplyAndAddUnsafe(R, u1, u2); // (sr^-1)R-(hr^-1)G = -(hr^-1)G + (sr^-1)
	            if (!Q)
	                throw new Error('point at infinify'); // unsafe is fine: no priv data leaked
	            Q.assertValidity();
	            return Q;
	        }
	        // Signatures should be low-s, to prevent malleability.
	        hasHighS() {
	            return isBiggerThanHalfOrder(this.s);
	        }
	        normalizeS() {
	            return this.hasHighS() ? new Signature(this.r, modN(-this.s), this.recovery) : this;
	        }
	        // DER-encoded
	        toDERRawBytes() {
	            return hexToBytes(this.toDERHex());
	        }
	        toDERHex() {
	            return DER.hexFromSig({ r: this.r, s: this.s });
	        }
	        // padded bytes of r, then padded bytes of s
	        toCompactRawBytes() {
	            return hexToBytes(this.toCompactHex());
	        }
	        toCompactHex() {
	            return numToNByteStr(this.r) + numToNByteStr(this.s);
	        }
	    }
	    const utils = {
	        isValidPrivateKey(privateKey) {
	            try {
	                normPrivateKeyToScalar(privateKey);
	                return true;
	            }
	            catch (error) {
	                return false;
	            }
	        },
	        normPrivateKeyToScalar: normPrivateKeyToScalar,
	        /**
	         * Produces cryptographically secure private key from random of size
	         * (groupLen + ceil(groupLen / 2)) with modulo bias being negligible.
	         */
	        randomPrivateKey: () => {
	            const length = getMinHashLength(CURVE.n);
	            return mapHashToField(CURVE.randomBytes(length), CURVE.n);
	        },
	        /**
	         * Creates precompute table for an arbitrary EC point. Makes point "cached".
	         * Allows to massively speed-up `point.multiply(scalar)`.
	         * @returns cached point
	         * @example
	         * const fast = utils.precompute(8, ProjectivePoint.fromHex(someonesPubKey));
	         * fast.multiply(privKey); // much faster ECDH now
	         */
	        precompute(windowSize = 8, point = Point.BASE) {
	            point._setWindowSize(windowSize);
	            point.multiply(BigInt(3)); // 3 is arbitrary, just need any number here
	            return point;
	        },
	    };
	    /**
	     * Computes public key for a private key. Checks for validity of the private key.
	     * @param privateKey private key
	     * @param isCompressed whether to return compact (default), or full key
	     * @returns Public key, full when isCompressed=false; short when isCompressed=true
	     */
	    function getPublicKey(privateKey, isCompressed = true) {
	        return Point.fromPrivateKey(privateKey).toRawBytes(isCompressed);
	    }
	    /**
	     * Quick and dirty check for item being public key. Does not validate hex, or being on-curve.
	     */
	    function isProbPub(item) {
	        const arr = item instanceof Uint8Array;
	        const str = typeof item === 'string';
	        const len = (arr || str) && item.length;
	        if (arr)
	            return len === compressedLen || len === uncompressedLen;
	        if (str)
	            return len === 2 * compressedLen || len === 2 * uncompressedLen;
	        if (item instanceof Point)
	            return true;
	        return false;
	    }
	    /**
	     * ECDH (Elliptic Curve Diffie Hellman).
	     * Computes shared public key from private key and public key.
	     * Checks: 1) private key validity 2) shared key is on-curve.
	     * Does NOT hash the result.
	     * @param privateA private key
	     * @param publicB different public key
	     * @param isCompressed whether to return compact (default), or full key
	     * @returns shared public key
	     */
	    function getSharedSecret(privateA, publicB, isCompressed = true) {
	        if (isProbPub(privateA))
	            throw new Error('first arg must be private key');
	        if (!isProbPub(publicB))
	            throw new Error('second arg must be public key');
	        const b = Point.fromHex(publicB); // check for being on-curve
	        return b.multiply(normPrivateKeyToScalar(privateA)).toRawBytes(isCompressed);
	    }
	    // RFC6979: ensure ECDSA msg is X bytes and < N. RFC suggests optional truncating via bits2octets.
	    // FIPS 186-4 4.6 suggests the leftmost min(nBitLen, outLen) bits, which matches bits2int.
	    // bits2int can produce res>N, we can do mod(res, N) since the bitLen is the same.
	    // int2octets can't be used; pads small msgs with 0: unacceptatble for trunc as per RFC vectors
	    const bits2int = CURVE.bits2int ||
	        function (bytes) {
	            // For curves with nBitLength % 8 !== 0: bits2octets(bits2octets(m)) !== bits2octets(m)
	            // for some cases, since bytes.length * 8 is not actual bitLength.
	            const num = bytesToNumberBE(bytes); // check for == u8 done here
	            const delta = bytes.length * 8 - CURVE.nBitLength; // truncate to nBitLength leftmost bits
	            return delta > 0 ? num >> BigInt(delta) : num;
	        };
	    const bits2int_modN = CURVE.bits2int_modN ||
	        function (bytes) {
	            return modN(bits2int(bytes)); // can't use bytesToNumberBE here
	        };
	    // NOTE: pads output with zero as per spec
	    const ORDER_MASK = bitMask(CURVE.nBitLength);
	    /**
	     * Converts to bytes. Checks if num in `[0..ORDER_MASK-1]` e.g.: `[0..2^256-1]`.
	     */
	    function int2octets(num) {
	        if (typeof num !== 'bigint')
	            throw new Error('bigint expected');
	        if (!(_0n$1 <= num && num < ORDER_MASK))
	            throw new Error(`bigint expected < 2^${CURVE.nBitLength}`);
	        // works with order, can have different size than numToField!
	        return numberToBytesBE(num, CURVE.nByteLength);
	    }
	    // Steps A, D of RFC6979 3.2
	    // Creates RFC6979 seed; converts msg/privKey to numbers.
	    // Used only in sign, not in verify.
	    // NOTE: we cannot assume here that msgHash has same amount of bytes as curve order, this will be wrong at least for P521.
	    // Also it can be bigger for P224 + SHA256
	    function prepSig(msgHash, privateKey, opts = defaultSigOpts) {
	        if (['recovered', 'canonical'].some((k) => k in opts))
	            throw new Error('sign() legacy options not supported');
	        const { hash, randomBytes } = CURVE;
	        let { lowS, prehash, extraEntropy: ent } = opts; // generates low-s sigs by default
	        if (lowS == null)
	            lowS = true; // RFC6979 3.2: we skip step A, because we already provide hash
	        msgHash = ensureBytes('msgHash', msgHash);
	        if (prehash)
	            msgHash = ensureBytes('prehashed msgHash', hash(msgHash));
	        // We can't later call bits2octets, since nested bits2int is broken for curves
	        // with nBitLength % 8 !== 0. Because of that, we unwrap it here as int2octets call.
	        // const bits2octets = (bits) => int2octets(bits2int_modN(bits))
	        const h1int = bits2int_modN(msgHash);
	        const d = normPrivateKeyToScalar(privateKey); // validate private key, convert to bigint
	        const seedArgs = [int2octets(d), int2octets(h1int)];
	        // extraEntropy. RFC6979 3.6: additional k' (optional).
	        if (ent != null) {
	            // K = HMAC_K(V || 0x00 || int2octets(x) || bits2octets(h1) || k')
	            const e = ent === true ? randomBytes(Fp.BYTES) : ent; // generate random bytes OR pass as-is
	            seedArgs.push(ensureBytes('extraEntropy', e)); // check for being bytes
	        }
	        const seed = concatBytes(...seedArgs); // Step D of RFC6979 3.2
	        const m = h1int; // NOTE: no need to call bits2int second time here, it is inside truncateHash!
	        // Converts signature params into point w r/s, checks result for validity.
	        function k2sig(kBytes) {
	            // RFC 6979 Section 3.2, step 3: k = bits2int(T)
	            const k = bits2int(kBytes); // Cannot use fields methods, since it is group element
	            if (!isWithinCurveOrder(k))
	                return; // Important: all mod() calls here must be done over N
	            const ik = invN(k); // k^-1 mod n
	            const q = Point.BASE.multiply(k).toAffine(); // q = Gk
	            const r = modN(q.x); // r = q.x mod n
	            if (r === _0n$1)
	                return;
	            // Can use scalar blinding b^-1(bm + bdr) where b ∈ [1,q−1] according to
	            // https://tches.iacr.org/index.php/TCHES/article/view/7337/6509. We've decided against it:
	            // a) dependency on CSPRNG b) 15% slowdown c) doesn't really help since bigints are not CT
	            const s = modN(ik * modN(m + r * d)); // Not using blinding here
	            if (s === _0n$1)
	                return;
	            let recovery = (q.x === r ? 0 : 2) | Number(q.y & _1n$1); // recovery bit (2 or 3, when q.x > n)
	            let normS = s;
	            if (lowS && isBiggerThanHalfOrder(s)) {
	                normS = normalizeS(s); // if lowS was passed, ensure s is always
	                recovery ^= 1; // // in the bottom half of N
	            }
	            return new Signature(r, normS, recovery); // use normS, not s
	        }
	        return { seed, k2sig };
	    }
	    const defaultSigOpts = { lowS: CURVE.lowS, prehash: false };
	    const defaultVerOpts = { lowS: CURVE.lowS, prehash: false };
	    /**
	     * Signs message hash with a private key.
	     * ```
	     * sign(m, d, k) where
	     *   (x, y) = G × k
	     *   r = x mod n
	     *   s = (m + dr)/k mod n
	     * ```
	     * @param msgHash NOT message. msg needs to be hashed to `msgHash`, or use `prehash`.
	     * @param privKey private key
	     * @param opts lowS for non-malleable sigs. extraEntropy for mixing randomness into k. prehash will hash first arg.
	     * @returns signature with recovery param
	     */
	    function sign(msgHash, privKey, opts = defaultSigOpts) {
	        const { seed, k2sig } = prepSig(msgHash, privKey, opts); // Steps A, D of RFC6979 3.2.
	        const C = CURVE;
	        const drbg = createHmacDrbg(C.hash.outputLen, C.nByteLength, C.hmac);
	        return drbg(seed, k2sig); // Steps B, C, D, E, F, G
	    }
	    // Enable precomputes. Slows down first publicKey computation by 20ms.
	    Point.BASE._setWindowSize(8);
	    // utils.precompute(8, ProjectivePoint.BASE)
	    /**
	     * Verifies a signature against message hash and public key.
	     * Rejects lowS signatures by default: to override,
	     * specify option `{lowS: false}`. Implements section 4.1.4 from https://www.secg.org/sec1-v2.pdf:
	     *
	     * ```
	     * verify(r, s, h, P) where
	     *   U1 = hs^-1 mod n
	     *   U2 = rs^-1 mod n
	     *   R = U1⋅G - U2⋅P
	     *   mod(R.x, n) == r
	     * ```
	     */
	    function verify(signature, msgHash, publicKey, opts = defaultVerOpts) {
	        const sg = signature;
	        msgHash = ensureBytes('msgHash', msgHash);
	        publicKey = ensureBytes('publicKey', publicKey);
	        if ('strict' in opts)
	            throw new Error('options.strict was renamed to lowS');
	        const { lowS, prehash } = opts;
	        let _sig = undefined;
	        let P;
	        try {
	            if (typeof sg === 'string' || sg instanceof Uint8Array) {
	                // Signature can be represented in 2 ways: compact (2*nByteLength) & DER (variable-length).
	                // Since DER can also be 2*nByteLength bytes, we check for it first.
	                try {
	                    _sig = Signature.fromDER(sg);
	                }
	                catch (derError) {
	                    if (!(derError instanceof DER.Err))
	                        throw derError;
	                    _sig = Signature.fromCompact(sg);
	                }
	            }
	            else if (typeof sg === 'object' && typeof sg.r === 'bigint' && typeof sg.s === 'bigint') {
	                const { r, s } = sg;
	                _sig = new Signature(r, s);
	            }
	            else {
	                throw new Error('PARSE');
	            }
	            P = Point.fromHex(publicKey);
	        }
	        catch (error) {
	            if (error.message === 'PARSE')
	                throw new Error(`signature must be Signature instance, Uint8Array or hex string`);
	            return false;
	        }
	        if (lowS && _sig.hasHighS())
	            return false;
	        if (prehash)
	            msgHash = CURVE.hash(msgHash);
	        const { r, s } = _sig;
	        const h = bits2int_modN(msgHash); // Cannot use fields methods, since it is group element
	        const is = invN(s); // s^-1
	        const u1 = modN(h * is); // u1 = hs^-1 mod n
	        const u2 = modN(r * is); // u2 = rs^-1 mod n
	        const R = Point.BASE.multiplyAndAddUnsafe(P, u1, u2)?.toAffine(); // R = u1⋅G + u2⋅P
	        if (!R)
	            return false;
	        const v = modN(R.x);
	        return v === r;
	    }
	    return {
	        CURVE,
	        getPublicKey,
	        getSharedSecret,
	        sign,
	        verify,
	        ProjectivePoint: Point,
	        Signature,
	        utils,
	    };
	}

	// HMAC (RFC 2104)
	class HMAC extends Hash$1 {
	    constructor(hash, _key) {
	        super();
	        this.finished = false;
	        this.destroyed = false;
	        hash$1(hash);
	        const key = toBytes$1(_key);
	        this.iHash = hash.create();
	        if (typeof this.iHash.update !== 'function')
	            throw new Error('Expected instance of class which extends utils.Hash');
	        this.blockLen = this.iHash.blockLen;
	        this.outputLen = this.iHash.outputLen;
	        const blockLen = this.blockLen;
	        const pad = new Uint8Array(blockLen);
	        // blockLen can be bigger than outputLen
	        pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
	        for (let i = 0; i < pad.length; i++)
	            pad[i] ^= 0x36;
	        this.iHash.update(pad);
	        // By doing update (processing of first block) of outer hash here we can re-use it between multiple calls via clone
	        this.oHash = hash.create();
	        // Undo internal XOR && apply outer XOR
	        for (let i = 0; i < pad.length; i++)
	            pad[i] ^= 0x36 ^ 0x5c;
	        this.oHash.update(pad);
	        pad.fill(0);
	    }
	    update(buf) {
	        exists$1(this);
	        this.iHash.update(buf);
	        return this;
	    }
	    digestInto(out) {
	        exists$1(this);
	        bytes$1(out, this.outputLen);
	        this.finished = true;
	        this.iHash.digestInto(out);
	        this.oHash.update(out);
	        this.oHash.digestInto(out);
	        this.destroy();
	    }
	    digest() {
	        const out = new Uint8Array(this.oHash.outputLen);
	        this.digestInto(out);
	        return out;
	    }
	    _cloneInto(to) {
	        // Create new instance without calling constructor since key already in state and we don't know it.
	        to || (to = Object.create(Object.getPrototypeOf(this), {}));
	        const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
	        to = to;
	        to.finished = finished;
	        to.destroyed = destroyed;
	        to.blockLen = blockLen;
	        to.outputLen = outputLen;
	        to.oHash = oHash._cloneInto(to.oHash);
	        to.iHash = iHash._cloneInto(to.iHash);
	        return to;
	    }
	    destroy() {
	        this.destroyed = true;
	        this.oHash.destroy();
	        this.iHash.destroy();
	    }
	}
	/**
	 * HMAC: RFC2104 message authentication code.
	 * @param hash - function that would be used e.g. sha256
	 * @param key - message key
	 * @param message - message data
	 */
	const hmac = (hash, key, message) => new HMAC(hash, key).update(message).digest();
	hmac.create = (hash, key) => new HMAC(hash, key);

	/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
	// connects noble-curves to noble-hashes
	function getHash(hash) {
	    return {
	        hash,
	        hmac: (key, ...msgs) => hmac(hash, key, concatBytes$1(...msgs)),
	        randomBytes,
	    };
	}
	function createCurve(curveDef, defHash) {
	    const create = (hash) => weierstrass({ ...curveDef, ...getHash(hash) });
	    return Object.freeze({ ...create(defHash), create });
	}

	/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
	const secp256k1P = BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f');
	const secp256k1N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
	const _1n = BigInt(1);
	const _2n = BigInt(2);
	const divNearest = (a, b) => (a + b / _2n) / b;
	/**
	 * √n = n^((p+1)/4) for fields p = 3 mod 4. We unwrap the loop and multiply bit-by-bit.
	 * (P+1n/4n).toString(2) would produce bits [223x 1, 0, 22x 1, 4x 0, 11, 00]
	 */
	function sqrtMod(y) {
	    const P = secp256k1P;
	    // prettier-ignore
	    const _3n = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
	    // prettier-ignore
	    const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
	    const b2 = (y * y * y) % P; // x^3, 11
	    const b3 = (b2 * b2 * y) % P; // x^7
	    const b6 = (pow2(b3, _3n, P) * b3) % P;
	    const b9 = (pow2(b6, _3n, P) * b3) % P;
	    const b11 = (pow2(b9, _2n, P) * b2) % P;
	    const b22 = (pow2(b11, _11n, P) * b11) % P;
	    const b44 = (pow2(b22, _22n, P) * b22) % P;
	    const b88 = (pow2(b44, _44n, P) * b44) % P;
	    const b176 = (pow2(b88, _88n, P) * b88) % P;
	    const b220 = (pow2(b176, _44n, P) * b44) % P;
	    const b223 = (pow2(b220, _3n, P) * b3) % P;
	    const t1 = (pow2(b223, _23n, P) * b22) % P;
	    const t2 = (pow2(t1, _6n, P) * b2) % P;
	    const root = pow2(t2, _2n, P);
	    if (!Fp.eql(Fp.sqr(root), y))
	        throw new Error('Cannot find square root');
	    return root;
	}
	const Fp = Field(secp256k1P, undefined, undefined, { sqrt: sqrtMod });
	const secp256k1 = createCurve({
	    a: BigInt(0),
	    b: BigInt(7),
	    Fp,
	    n: secp256k1N,
	    // Base point (x, y) aka generator point
	    Gx: BigInt('55066263022277343669578718895168534326250603453777594175500187360389116729240'),
	    Gy: BigInt('32670510020758816978083085130507043184471273380659243275938904335757337482424'),
	    h: BigInt(1),
	    lowS: true,
	    /**
	     * secp256k1 belongs to Koblitz curves: it has efficiently computable endomorphism.
	     * Endomorphism uses 2x less RAM, speeds up precomputation by 2x and ECDH / key recovery by 20%.
	     * For precomputed wNAF it trades off 1/2 init time & 1/3 ram for 20% perf hit.
	     * Explanation: https://gist.github.com/paulmillr/eb670806793e84df628a7c434a873066
	     */
	    endo: {
	        beta: BigInt('0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee'),
	        splitScalar: (k) => {
	            const n = secp256k1N;
	            const a1 = BigInt('0x3086d221a7d46bcde86c90e49284eb15');
	            const b1 = -_1n * BigInt('0xe4437ed6010e88286f547fa90abfe4c3');
	            const a2 = BigInt('0x114ca50f7a8e2f3f657c1108d9d44cfd8');
	            const b2 = a1;
	            const POW_2_128 = BigInt('0x100000000000000000000000000000000'); // (2n**128n).toString(16)
	            const c1 = divNearest(b2 * k, n);
	            const c2 = divNearest(-b1 * k, n);
	            let k1 = mod(k - c1 * a1 - c2 * a2, n);
	            let k2 = mod(-c1 * b1 - c2 * b2, n);
	            const k1neg = k1 > POW_2_128;
	            const k2neg = k2 > POW_2_128;
	            if (k1neg)
	                k1 = n - k1;
	            if (k2neg)
	                k2 = n - k2;
	            if (k1 > POW_2_128 || k2 > POW_2_128) {
	                throw new Error('splitScalar: Endomorphism failed, k=' + k);
	            }
	            return { k1neg, k1, k2neg, k2 };
	        },
	    },
	}, sha256$1);
	// Schnorr signatures are superior to ECDSA from above. Below is Schnorr-specific BIP0340 code.
	// https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki
	const _0n = BigInt(0);
	const fe = (x) => typeof x === 'bigint' && _0n < x && x < secp256k1P;
	const ge = (x) => typeof x === 'bigint' && _0n < x && x < secp256k1N;
	/** An object mapping tags to their tagged hash prefix of [SHA256(tag) | SHA256(tag)] */
	const TAGGED_HASH_PREFIXES = {};
	function taggedHash(tag, ...messages) {
	    let tagP = TAGGED_HASH_PREFIXES[tag];
	    if (tagP === undefined) {
	        const tagH = sha256$1(Uint8Array.from(tag, (c) => c.charCodeAt(0)));
	        tagP = concatBytes(tagH, tagH);
	        TAGGED_HASH_PREFIXES[tag] = tagP;
	    }
	    return sha256$1(concatBytes(tagP, ...messages));
	}
	// ECDSA compact points are 33-byte. Schnorr is 32: we strip first byte 0x02 or 0x03
	const pointToBytes = (point) => point.toRawBytes(true).slice(1);
	const numTo32b = (n) => numberToBytesBE(n, 32);
	const modP = (x) => mod(x, secp256k1P);
	const modN = (x) => mod(x, secp256k1N);
	const Point = secp256k1.ProjectivePoint;
	const GmulAdd = (Q, a, b) => Point.BASE.multiplyAndAddUnsafe(Q, a, b);
	// Calculate point, scalar and bytes
	function schnorrGetExtPubKey(priv) {
	    let d_ = secp256k1.utils.normPrivateKeyToScalar(priv); // same method executed in fromPrivateKey
	    let p = Point.fromPrivateKey(d_); // P = d'⋅G; 0 < d' < n check is done inside
	    const scalar = p.hasEvenY() ? d_ : modN(-d_);
	    return { scalar: scalar, bytes: pointToBytes(p) };
	}
	/**
	 * lift_x from BIP340. Convert 32-byte x coordinate to elliptic curve point.
	 * @returns valid point checked for being on-curve
	 */
	function lift_x(x) {
	    if (!fe(x))
	        throw new Error('bad x: need 0 < x < p'); // Fail if x ≥ p.
	    const xx = modP(x * x);
	    const c = modP(xx * x + BigInt(7)); // Let c = x³ + 7 mod p.
	    let y = sqrtMod(c); // Let y = c^(p+1)/4 mod p.
	    if (y % _2n !== _0n)
	        y = modP(-y); // Return the unique point P such that x(P) = x and
	    const p = new Point(x, y, _1n); // y(P) = y if y mod 2 = 0 or y(P) = p-y otherwise.
	    p.assertValidity();
	    return p;
	}
	/**
	 * Create tagged hash, convert it to bigint, reduce modulo-n.
	 */
	function challenge(...args) {
	    return modN(bytesToNumberBE(taggedHash('BIP0340/challenge', ...args)));
	}
	/**
	 * Schnorr public key is just `x` coordinate of Point as per BIP340.
	 */
	function schnorrGetPublicKey(privateKey) {
	    return schnorrGetExtPubKey(privateKey).bytes; // d'=int(sk). Fail if d'=0 or d'≥n. Ret bytes(d'⋅G)
	}
	/**
	 * Creates Schnorr signature as per BIP340. Verifies itself before returning anything.
	 * auxRand is optional and is not the sole source of k generation: bad CSPRNG won't be dangerous.
	 */
	function schnorrSign(message, privateKey, auxRand = randomBytes(32)) {
	    const m = ensureBytes('message', message);
	    const { bytes: px, scalar: d } = schnorrGetExtPubKey(privateKey); // checks for isWithinCurveOrder
	    const a = ensureBytes('auxRand', auxRand, 32); // Auxiliary random data a: a 32-byte array
	    const t = numTo32b(d ^ bytesToNumberBE(taggedHash('BIP0340/aux', a))); // Let t be the byte-wise xor of bytes(d) and hash/aux(a)
	    const rand = taggedHash('BIP0340/nonce', t, px, m); // Let rand = hash/nonce(t || bytes(P) || m)
	    const k_ = modN(bytesToNumberBE(rand)); // Let k' = int(rand) mod n
	    if (k_ === _0n)
	        throw new Error('sign failed: k is zero'); // Fail if k' = 0.
	    const { bytes: rx, scalar: k } = schnorrGetExtPubKey(k_); // Let R = k'⋅G.
	    const e = challenge(rx, px, m); // Let e = int(hash/challenge(bytes(R) || bytes(P) || m)) mod n.
	    const sig = new Uint8Array(64); // Let sig = bytes(R) || bytes((k + ed) mod n).
	    sig.set(rx, 0);
	    sig.set(numTo32b(modN(k + e * d)), 32);
	    // If Verify(bytes(P), m, sig) (see below) returns failure, abort
	    if (!schnorrVerify(sig, m, px))
	        throw new Error('sign: Invalid signature produced');
	    return sig;
	}
	/**
	 * Verifies Schnorr signature.
	 * Will swallow errors & return false except for initial type validation of arguments.
	 */
	function schnorrVerify(signature, message, publicKey) {
	    const sig = ensureBytes('signature', signature, 64);
	    const m = ensureBytes('message', message);
	    const pub = ensureBytes('publicKey', publicKey, 32);
	    try {
	        const P = lift_x(bytesToNumberBE(pub)); // P = lift_x(int(pk)); fail if that fails
	        const r = bytesToNumberBE(sig.subarray(0, 32)); // Let r = int(sig[0:32]); fail if r ≥ p.
	        if (!fe(r))
	            return false;
	        const s = bytesToNumberBE(sig.subarray(32, 64)); // Let s = int(sig[32:64]); fail if s ≥ n.
	        if (!ge(s))
	            return false;
	        const e = challenge(numTo32b(r), pointToBytes(P), m); // int(challenge(bytes(r)||bytes(P)||m))%n
	        const R = GmulAdd(P, s, modN(-e)); // R = s⋅G - e⋅P
	        if (!R || !R.hasEvenY() || R.toAffine().x !== r)
	            return false; // -eP == (n-e)P
	        return true; // Fail if is_infinite(R) / not has_even_y(R) / x(R) ≠ r.
	    }
	    catch (error) {
	        return false;
	    }
	}
	const schnorr = /* @__PURE__ */ (() => ({
	    getPublicKey: schnorrGetPublicKey,
	    sign: schnorrSign,
	    verify: schnorrVerify,
	    utils: {
	        randomPrivateKey: secp256k1.utils.randomPrivateKey,
	        lift_x,
	        pointToBytes,
	        numberToBytesBE,
	        bytesToNumberBE,
	        taggedHash,
	        mod,
	    },
	}))();

	/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
	// We use WebCrypto aka globalThis.crypto, which exists in browsers and node.js 16+.
	// node.js versions earlier than v19 don't declare it in global scope.
	// For node.js, package.json#exports field mapping rewrites import
	// from `crypto` to `cryptoNode`, which imports native module.
	// Makes the utils un-importable in browsers without a bundler.
	// Once node.js 18 is deprecated, we can just drop the import.
	const u8a = (a) => a instanceof Uint8Array;
	// Cast array to view
	const createView = (arr) => new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
	// The rotate right (circular right shift) operation for uint32
	const rotr = (word, shift) => (word << (32 - shift)) | (word >>> shift);
	// big-endian hardware is rare. Just in case someone still decides to run hashes:
	// early-throw an error because we don't support BE yet.
	const isLE = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
	if (!isLE)
	    throw new Error('Non little-endian hardware is not supported');
	const hexes = Array.from({ length: 256 }, (v, i) => i.toString(16).padStart(2, '0'));
	/**
	 * @example bytesToHex(Uint8Array.from([0xca, 0xfe, 0x01, 0x23])) // 'cafe0123'
	 */
	function bytesToHex(bytes) {
	    if (!u8a(bytes))
	        throw new Error('Uint8Array expected');
	    // pre-caching improves the speed 6x
	    let hex = '';
	    for (let i = 0; i < bytes.length; i++) {
	        hex += hexes[bytes[i]];
	    }
	    return hex;
	}
	/**
	 * @example utf8ToBytes('abc') // new Uint8Array([97, 98, 99])
	 */
	function utf8ToBytes(str) {
	    if (typeof str !== 'string')
	        throw new Error(`utf8ToBytes expected string, got ${typeof str}`);
	    return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
	}
	/**
	 * Normalizes (non-hex) string or Uint8Array to Uint8Array.
	 * Warning: when Uint8Array is passed, it would NOT get copied.
	 * Keep in mind for future mutable operations.
	 */
	function toBytes(data) {
	    if (typeof data === 'string')
	        data = utf8ToBytes(data);
	    if (!u8a(data))
	        throw new Error(`expected Uint8Array, got ${typeof data}`);
	    return data;
	}
	// For runtime check if class implements interface
	class Hash {
	    // Safe version that clones internal state
	    clone() {
	        return this._cloneInto();
	    }
	}
	function wrapConstructor(hashCons) {
	    const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
	    const tmp = hashCons();
	    hashC.outputLen = tmp.outputLen;
	    hashC.blockLen = tmp.blockLen;
	    hashC.create = () => hashCons();
	    return hashC;
	}

	function number(n) {
	    if (!Number.isSafeInteger(n) || n < 0)
	        throw new Error(`Wrong positive integer: ${n}`);
	}
	function bool(b) {
	    if (typeof b !== 'boolean')
	        throw new Error(`Expected boolean, not ${b}`);
	}
	function bytes(b, ...lengths) {
	    if (!(b instanceof Uint8Array))
	        throw new Error('Expected Uint8Array');
	    if (lengths.length > 0 && !lengths.includes(b.length))
	        throw new Error(`Expected Uint8Array of length ${lengths}, not of length=${b.length}`);
	}
	function hash(hash) {
	    if (typeof hash !== 'function' || typeof hash.create !== 'function')
	        throw new Error('Hash should be wrapped by utils.wrapConstructor');
	    number(hash.outputLen);
	    number(hash.blockLen);
	}
	function exists(instance, checkFinished = true) {
	    if (instance.destroyed)
	        throw new Error('Hash instance has been destroyed');
	    if (checkFinished && instance.finished)
	        throw new Error('Hash#digest() has already been called');
	}
	function output(out, instance) {
	    bytes(out);
	    const min = instance.outputLen;
	    if (out.length < min) {
	        throw new Error(`digestInto() expects output buffer of length at least ${min}`);
	    }
	}
	const assert = {
	    number,
	    bool,
	    bytes,
	    hash,
	    exists,
	    output,
	};

	// Polyfill for Safari 14
	function setBigUint64(view, byteOffset, value, isLE) {
	    if (typeof view.setBigUint64 === 'function')
	        return view.setBigUint64(byteOffset, value, isLE);
	    const _32n = BigInt(32);
	    const _u32_max = BigInt(0xffffffff);
	    const wh = Number((value >> _32n) & _u32_max);
	    const wl = Number(value & _u32_max);
	    const h = isLE ? 4 : 0;
	    const l = isLE ? 0 : 4;
	    view.setUint32(byteOffset + h, wh, isLE);
	    view.setUint32(byteOffset + l, wl, isLE);
	}
	// Base SHA2 class (RFC 6234)
	class SHA2 extends Hash {
	    constructor(blockLen, outputLen, padOffset, isLE) {
	        super();
	        this.blockLen = blockLen;
	        this.outputLen = outputLen;
	        this.padOffset = padOffset;
	        this.isLE = isLE;
	        this.finished = false;
	        this.length = 0;
	        this.pos = 0;
	        this.destroyed = false;
	        this.buffer = new Uint8Array(blockLen);
	        this.view = createView(this.buffer);
	    }
	    update(data) {
	        assert.exists(this);
	        const { view, buffer, blockLen } = this;
	        data = toBytes(data);
	        const len = data.length;
	        for (let pos = 0; pos < len;) {
	            const take = Math.min(blockLen - this.pos, len - pos);
	            // Fast path: we have at least one block in input, cast it to view and process
	            if (take === blockLen) {
	                const dataView = createView(data);
	                for (; blockLen <= len - pos; pos += blockLen)
	                    this.process(dataView, pos);
	                continue;
	            }
	            buffer.set(data.subarray(pos, pos + take), this.pos);
	            this.pos += take;
	            pos += take;
	            if (this.pos === blockLen) {
	                this.process(view, 0);
	                this.pos = 0;
	            }
	        }
	        this.length += data.length;
	        this.roundClean();
	        return this;
	    }
	    digestInto(out) {
	        assert.exists(this);
	        assert.output(out, this);
	        this.finished = true;
	        // Padding
	        // We can avoid allocation of buffer for padding completely if it
	        // was previously not allocated here. But it won't change performance.
	        const { buffer, view, blockLen, isLE } = this;
	        let { pos } = this;
	        // append the bit '1' to the message
	        buffer[pos++] = 0b10000000;
	        this.buffer.subarray(pos).fill(0);
	        // we have less than padOffset left in buffer, so we cannot put length in current block, need process it and pad again
	        if (this.padOffset > blockLen - pos) {
	            this.process(view, 0);
	            pos = 0;
	        }
	        // Pad until full block byte with zeros
	        for (let i = pos; i < blockLen; i++)
	            buffer[i] = 0;
	        // Note: sha512 requires length to be 128bit integer, but length in JS will overflow before that
	        // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
	        // So we just write lowest 64 bits of that value.
	        setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
	        this.process(view, 0);
	        const oview = createView(out);
	        const len = this.outputLen;
	        // NOTE: we do division by 4 later, which should be fused in single op with modulo by JIT
	        if (len % 4)
	            throw new Error('_sha2: outputLen should be aligned to 32bit');
	        const outLen = len / 4;
	        const state = this.get();
	        if (outLen > state.length)
	            throw new Error('_sha2: outputLen bigger than state');
	        for (let i = 0; i < outLen; i++)
	            oview.setUint32(4 * i, state[i], isLE);
	    }
	    digest() {
	        const { buffer, outputLen } = this;
	        this.digestInto(buffer);
	        const res = buffer.slice(0, outputLen);
	        this.destroy();
	        return res;
	    }
	    _cloneInto(to) {
	        to || (to = new this.constructor());
	        to.set(...this.get());
	        const { blockLen, buffer, length, finished, destroyed, pos } = this;
	        to.length = length;
	        to.pos = pos;
	        to.finished = finished;
	        to.destroyed = destroyed;
	        if (length % blockLen)
	            to.buffer.set(buffer);
	        return to;
	    }
	}

	// Choice: a ? b : c
	const Chi = (a, b, c) => (a & b) ^ (~a & c);
	// Majority function, true if any two inpust is true
	const Maj = (a, b, c) => (a & b) ^ (a & c) ^ (b & c);
	// Round constants:
	// first 32 bits of the fractional parts of the cube roots of the first 64 primes 2..311)
	// prettier-ignore
	const SHA256_K = new Uint32Array([
	    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
	]);
	// Initial state (first 32 bits of the fractional parts of the square roots of the first 8 primes 2..19):
	// prettier-ignore
	const IV = new Uint32Array([
	    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
	]);
	// Temporary buffer, not used to store anything between runs
	// Named this way because it matches specification.
	const SHA256_W = new Uint32Array(64);
	class SHA256 extends SHA2 {
	    constructor() {
	        super(64, 32, 8, false);
	        // We cannot use array here since array allows indexing by variable
	        // which means optimizer/compiler cannot use registers.
	        this.A = IV[0] | 0;
	        this.B = IV[1] | 0;
	        this.C = IV[2] | 0;
	        this.D = IV[3] | 0;
	        this.E = IV[4] | 0;
	        this.F = IV[5] | 0;
	        this.G = IV[6] | 0;
	        this.H = IV[7] | 0;
	    }
	    get() {
	        const { A, B, C, D, E, F, G, H } = this;
	        return [A, B, C, D, E, F, G, H];
	    }
	    // prettier-ignore
	    set(A, B, C, D, E, F, G, H) {
	        this.A = A | 0;
	        this.B = B | 0;
	        this.C = C | 0;
	        this.D = D | 0;
	        this.E = E | 0;
	        this.F = F | 0;
	        this.G = G | 0;
	        this.H = H | 0;
	    }
	    process(view, offset) {
	        // Extend the first 16 words into the remaining 48 words w[16..63] of the message schedule array
	        for (let i = 0; i < 16; i++, offset += 4)
	            SHA256_W[i] = view.getUint32(offset, false);
	        for (let i = 16; i < 64; i++) {
	            const W15 = SHA256_W[i - 15];
	            const W2 = SHA256_W[i - 2];
	            const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ (W15 >>> 3);
	            const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ (W2 >>> 10);
	            SHA256_W[i] = (s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16]) | 0;
	        }
	        // Compression function main loop, 64 rounds
	        let { A, B, C, D, E, F, G, H } = this;
	        for (let i = 0; i < 64; i++) {
	            const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
	            const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
	            const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
	            const T2 = (sigma0 + Maj(A, B, C)) | 0;
	            H = G;
	            G = F;
	            F = E;
	            E = (D + T1) | 0;
	            D = C;
	            C = B;
	            B = A;
	            A = (T1 + T2) | 0;
	        }
	        // Add the compressed chunk to the current hash value
	        A = (A + this.A) | 0;
	        B = (B + this.B) | 0;
	        C = (C + this.C) | 0;
	        D = (D + this.D) | 0;
	        E = (E + this.E) | 0;
	        F = (F + this.F) | 0;
	        G = (G + this.G) | 0;
	        H = (H + this.H) | 0;
	        this.set(A, B, C, D, E, F, G, H);
	    }
	    roundClean() {
	        SHA256_W.fill(0);
	    }
	    destroy() {
	        this.set(0, 0, 0, 0, 0, 0, 0, 0);
	        this.buffer.fill(0);
	    }
	}
	// Constants from https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
	class SHA224 extends SHA256 {
	    constructor() {
	        super();
	        this.A = 0xc1059ed8 | 0;
	        this.B = 0x367cd507 | 0;
	        this.C = 0x3070dd17 | 0;
	        this.D = 0xf70e5939 | 0;
	        this.E = 0xffc00b31 | 0;
	        this.F = 0x68581511 | 0;
	        this.G = 0x64f98fa7 | 0;
	        this.H = 0xbefa4fa4 | 0;
	        this.outputLen = 28;
	    }
	}
	/**
	 * SHA2-256 hash function
	 * @param message - data that would be hashed
	 */
	const sha256 = wrapConstructor(() => new SHA256());
	wrapConstructor(() => new SHA224());

	// pure.ts

	// core.ts
	var verifiedSymbol = Symbol("verified");
	var isRecord = (obj) => obj instanceof Object;
	function validateEvent(event) {
	  if (!isRecord(event))
	    return false;
	  if (typeof event.kind !== "number")
	    return false;
	  if (typeof event.content !== "string")
	    return false;
	  if (typeof event.created_at !== "number")
	    return false;
	  if (typeof event.pubkey !== "string")
	    return false;
	  if (!event.pubkey.match(/^[a-f0-9]{64}$/))
	    return false;
	  if (!Array.isArray(event.tags))
	    return false;
	  for (let i2 = 0; i2 < event.tags.length; i2++) {
	    let tag = event.tags[i2];
	    if (!Array.isArray(tag))
	      return false;
	    for (let j = 0; j < tag.length; j++) {
	      if (typeof tag[j] === "object")
	        return false;
	    }
	  }
	  return true;
	}

	// utils.ts
	new TextDecoder("utf-8");
	var utf8Encoder = new TextEncoder();
	function normalizeURL(url) {
	  if (url.indexOf("://") === -1)
	    url = "wss://" + url;
	  let p = new URL(url);
	  p.pathname = p.pathname.replace(/\/+/g, "/");
	  if (p.pathname.endsWith("/"))
	    p.pathname = p.pathname.slice(0, -1);
	  if (p.port === "80" && p.protocol === "ws:" || p.port === "443" && p.protocol === "wss:")
	    p.port = "";
	  p.searchParams.sort();
	  p.hash = "";
	  return p.toString();
	}
	var QueueNode = class {
	  value;
	  next = null;
	  prev = null;
	  constructor(message) {
	    this.value = message;
	  }
	};
	var Queue = class {
	  first;
	  last;
	  constructor() {
	    this.first = null;
	    this.last = null;
	  }
	  enqueue(value) {
	    const newNode = new QueueNode(value);
	    if (!this.last) {
	      this.first = newNode;
	      this.last = newNode;
	    } else if (this.last === this.first) {
	      this.last = newNode;
	      this.last.prev = this.first;
	      this.first.next = newNode;
	    } else {
	      newNode.prev = this.last;
	      this.last.next = newNode;
	      this.last = newNode;
	    }
	    return true;
	  }
	  dequeue() {
	    if (!this.first)
	      return null;
	    if (this.first === this.last) {
	      const target2 = this.first;
	      this.first = null;
	      this.last = null;
	      return target2.value;
	    }
	    const target = this.first;
	    this.first = target.next;
	    return target.value;
	  }
	};

	// pure.ts
	var JS = class {
	  generateSecretKey() {
	    return schnorr.utils.randomPrivateKey();
	  }
	  getPublicKey(secretKey) {
	    return bytesToHex(schnorr.getPublicKey(secretKey));
	  }
	  finalizeEvent(t, secretKey) {
	    const event = t;
	    event.pubkey = bytesToHex(schnorr.getPublicKey(secretKey));
	    event.id = getEventHash(event);
	    event.sig = bytesToHex(schnorr.sign(getEventHash(event), secretKey));
	    event[verifiedSymbol] = true;
	    return event;
	  }
	  verifyEvent(event) {
	    if (typeof event[verifiedSymbol] === "boolean")
	      return event[verifiedSymbol];
	    const hash = getEventHash(event);
	    if (hash !== event.id) {
	      event[verifiedSymbol] = false;
	      return false;
	    }
	    try {
	      const valid = schnorr.verify(event.sig, hash, event.pubkey);
	      event[verifiedSymbol] = valid;
	      return valid;
	    } catch (err) {
	      event[verifiedSymbol] = false;
	      return false;
	    }
	  }
	};
	function serializeEvent(evt) {
	  if (!validateEvent(evt))
	    throw new Error("can't serialize event with wrong or missing properties");
	  return JSON.stringify([0, evt.pubkey, evt.created_at, evt.kind, evt.tags, evt.content]);
	}
	function getEventHash(event) {
	  let eventHash = sha256(utf8Encoder.encode(serializeEvent(event)));
	  return bytesToHex(eventHash);
	}
	var i = new JS();
	i.generateSecretKey;
	i.getPublicKey;
	i.finalizeEvent;
	var verifyEvent = i.verifyEvent;

	// kinds.ts
	var ClientAuth = 22242;

	// filter.ts
	function matchFilter(filter, event) {
	  if (filter.ids && filter.ids.indexOf(event.id) === -1) {
	    return false;
	  }
	  if (filter.kinds && filter.kinds.indexOf(event.kind) === -1) {
	    return false;
	  }
	  if (filter.authors && filter.authors.indexOf(event.pubkey) === -1) {
	    return false;
	  }
	  for (let f in filter) {
	    if (f[0] === "#") {
	      let tagName = f.slice(1);
	      let values = filter[`#${tagName}`];
	      if (values && !event.tags.find(([t, v]) => t === f.slice(1) && values.indexOf(v) !== -1))
	        return false;
	    }
	  }
	  if (filter.since && event.created_at < filter.since)
	    return false;
	  if (filter.until && event.created_at > filter.until)
	    return false;
	  return true;
	}
	function matchFilters(filters, event) {
	  for (let i2 = 0; i2 < filters.length; i2++) {
	    if (matchFilter(filters[i2], event)) {
	      return true;
	    }
	  }
	  return false;
	}

	// fakejson.ts
	function getHex64(json, field) {
	  let len = field.length + 3;
	  let idx = json.indexOf(`"${field}":`) + len;
	  let s = json.slice(idx).indexOf(`"`) + idx + 1;
	  return json.slice(s, s + 64);
	}
	function getSubscriptionId(json) {
	  let idx = json.slice(0, 22).indexOf(`"EVENT"`);
	  if (idx === -1)
	    return null;
	  let pstart = json.slice(idx + 7 + 1).indexOf(`"`);
	  if (pstart === -1)
	    return null;
	  let start = idx + 7 + 1 + pstart;
	  let pend = json.slice(start + 1, 80).indexOf(`"`);
	  if (pend === -1)
	    return null;
	  let end = start + 1 + pend;
	  return json.slice(start + 1, end);
	}

	// nip42.ts
	function makeAuthEvent(relayURL, challenge) {
	  return {
	    kind: ClientAuth,
	    created_at: Math.floor(Date.now() / 1e3),
	    tags: [
	      ["relay", relayURL],
	      ["challenge", challenge]
	    ],
	    content: ""
	  };
	}

	// helpers.ts
	async function yieldThread() {
	  return new Promise((resolve) => {
	    const ch = new MessageChannel();
	    const handler = () => {
	      ch.port1.removeEventListener("message", handler);
	      resolve();
	    };
	    ch.port1.addEventListener("message", handler);
	    ch.port2.postMessage(0);
	    ch.port1.start();
	  });
	}
	var alwaysTrue = (t) => {
	  t[verifiedSymbol] = true;
	  return true;
	};

	// abstract-relay.ts
	var AbstractRelay = class {
	  url;
	  _connected = false;
	  onclose = null;
	  onnotice = (msg) => console.debug(`NOTICE from ${this.url}: ${msg}`);
	  _onauth = null;
	  baseEoseTimeout = 4400;
	  connectionTimeout = 4400;
	  publishTimeout = 4400;
	  openSubs = /* @__PURE__ */ new Map();
	  connectionTimeoutHandle;
	  connectionPromise;
	  openCountRequests = /* @__PURE__ */ new Map();
	  openEventPublishes = /* @__PURE__ */ new Map();
	  ws;
	  incomingMessageQueue = new Queue();
	  queueRunning = false;
	  challenge;
	  serial = 0;
	  verifyEvent;
	  _WebSocket;
	  constructor(url, opts) {
	    this.url = normalizeURL(url);
	    this.verifyEvent = opts.verifyEvent;
	    this._WebSocket = opts.websocketImplementation || WebSocket;
	  }
	  static async connect(url, opts) {
	    const relay = new AbstractRelay(url, opts);
	    await relay.connect();
	    return relay;
	  }
	  closeAllSubscriptions(reason) {
	    for (let [_, sub] of this.openSubs) {
	      sub.close(reason);
	    }
	    this.openSubs.clear();
	    for (let [_, ep] of this.openEventPublishes) {
	      ep.reject(new Error(reason));
	    }
	    this.openEventPublishes.clear();
	    for (let [_, cr] of this.openCountRequests) {
	      cr.reject(new Error(reason));
	    }
	    this.openCountRequests.clear();
	  }
	  get connected() {
	    return this._connected;
	  }
	  async connect() {
	    if (this.connectionPromise)
	      return this.connectionPromise;
	    this.challenge = undefined;
	    this.connectionPromise = new Promise((resolve, reject) => {
	      this.connectionTimeoutHandle = setTimeout(() => {
	        reject("connection timed out");
	        this.connectionPromise = undefined;
	        this.onclose?.();
	        this.closeAllSubscriptions("relay connection timed out");
	      }, this.connectionTimeout);
	      try {
	        this.ws = new this._WebSocket(this.url);
	      } catch (err) {
	        reject(err);
	        return;
	      }
	      this.ws.onopen = () => {
	        clearTimeout(this.connectionTimeoutHandle);
	        this._connected = true;
	        resolve();
	      };
	      this.ws.onerror = (ev) => {
	        reject(ev.message || "websocket error");
	        if (this._connected) {
	          this._connected = false;
	          this.connectionPromise = undefined;
	          this.onclose?.();
	          this.closeAllSubscriptions("relay connection errored");
	        }
	      };
	      this.ws.onclose = async () => {
	        if (this._connected) {
	          this._connected = false;
	          this.connectionPromise = undefined;
	          this.onclose?.();
	          this.closeAllSubscriptions("relay connection closed");
	        }
	      };
	      this.ws.onmessage = this._onmessage.bind(this);
	    });
	    return this.connectionPromise;
	  }
	  async runQueue() {
	    this.queueRunning = true;
	    while (true) {
	      if (false === this.handleNext()) {
	        break;
	      }
	      await yieldThread();
	    }
	    this.queueRunning = false;
	  }
	  handleNext() {
	    const json = this.incomingMessageQueue.dequeue();
	    if (!json) {
	      return false;
	    }
	    const subid = getSubscriptionId(json);
	    if (subid) {
	      const so = this.openSubs.get(subid);
	      if (!so) {
	        return;
	      }
	      const id = getHex64(json, "id");
	      const alreadyHave = so.alreadyHaveEvent?.(id);
	      so.receivedEvent?.(this, id);
	      if (alreadyHave) {
	        return;
	      }
	    }
	    try {
	      let data = JSON.parse(json);
	      switch (data[0]) {
	        case "EVENT": {
	          const so = this.openSubs.get(data[1]);
	          const event = data[2];
	          if (this.verifyEvent(event) && matchFilters(so.filters, event)) {
	            so.onevent(event);
	          }
	          return;
	        }
	        case "COUNT": {
	          const id = data[1];
	          const payload = data[2];
	          const cr = this.openCountRequests.get(id);
	          if (cr) {
	            cr.resolve(payload.count);
	            this.openCountRequests.delete(id);
	          }
	          return;
	        }
	        case "EOSE": {
	          const so = this.openSubs.get(data[1]);
	          if (!so)
	            return;
	          so.receivedEose();
	          return;
	        }
	        case "OK": {
	          const id = data[1];
	          const ok = data[2];
	          const reason = data[3];
	          const ep = this.openEventPublishes.get(id);
	          if (ep) {
	            if (ok)
	              ep.resolve(reason);
	            else
	              ep.reject(new Error(reason));
	            this.openEventPublishes.delete(id);
	          }
	          return;
	        }
	        case "CLOSED": {
	          const id = data[1];
	          const so = this.openSubs.get(id);
	          if (!so)
	            return;
	          so.closed = true;
	          so.close(data[2]);
	          return;
	        }
	        case "NOTICE":
	          this.onnotice(data[1]);
	          return;
	        case "AUTH": {
	          this.challenge = data[1];
	          this._onauth?.(data[1]);
	          return;
	        }
	      }
	    } catch (err) {
	      return;
	    }
	  }
	  async send(message) {
	    if (!this.connectionPromise)
	      throw new Error("sending on closed connection");
	    this.connectionPromise.then(() => {
	      this.ws?.send(message);
	    });
	  }
	  async auth(signAuthEvent) {
	    if (!this.challenge)
	      throw new Error("can't perform auth, no challenge was received");
	    const evt = await signAuthEvent(makeAuthEvent(this.url, this.challenge));
	    const ret = new Promise((resolve, reject) => {
	      this.openEventPublishes.set(evt.id, { resolve, reject });
	    });
	    this.send('["AUTH",' + JSON.stringify(evt) + "]");
	    return ret;
	  }
	  async publish(event) {
	    const ret = new Promise((resolve, reject) => {
	      this.openEventPublishes.set(event.id, { resolve, reject });
	    });
	    this.send('["EVENT",' + JSON.stringify(event) + "]");
	    setTimeout(() => {
	      const ep = this.openEventPublishes.get(event.id);
	      if (ep) {
	        ep.reject(new Error("publish timed out"));
	        this.openEventPublishes.delete(event.id);
	      }
	    }, this.publishTimeout);
	    return ret;
	  }
	  async count(filters, params) {
	    this.serial++;
	    const id = params?.id || "count:" + this.serial;
	    const ret = new Promise((resolve, reject) => {
	      this.openCountRequests.set(id, { resolve, reject });
	    });
	    this.send('["COUNT","' + id + '",' + JSON.stringify(filters).substring(1));
	    return ret;
	  }
	  subscribe(filters, params) {
	    const subscription = this.prepareSubscription(filters, params);
	    subscription.fire();
	    return subscription;
	  }
	  prepareSubscription(filters, params) {
	    this.serial++;
	    const id = params.id || "sub:" + this.serial;
	    const subscription = new Subscription(this, id, filters, params);
	    this.openSubs.set(id, subscription);
	    return subscription;
	  }
	  close() {
	    this.closeAllSubscriptions("relay connection closed by us");
	    this._connected = false;
	    this.ws?.close();
	  }
	  _onmessage(ev) {
	    this.incomingMessageQueue.enqueue(ev.data);
	    if (!this.queueRunning) {
	      this.runQueue();
	    }
	  }
	};
	var Subscription = class {
	  relay;
	  id;
	  closed = false;
	  eosed = false;
	  filters;
	  alreadyHaveEvent;
	  receivedEvent;
	  onevent;
	  oneose;
	  onclose;
	  eoseTimeout;
	  eoseTimeoutHandle;
	  constructor(relay, id, filters, params) {
	    this.relay = relay;
	    this.filters = filters;
	    this.id = id;
	    this.alreadyHaveEvent = params.alreadyHaveEvent;
	    this.receivedEvent = params.receivedEvent;
	    this.eoseTimeout = params.eoseTimeout || relay.baseEoseTimeout;
	    this.oneose = params.oneose;
	    this.onclose = params.onclose;
	    this.onevent = params.onevent || ((event) => {
	      console.warn(
	        `onevent() callback not defined for subscription '${this.id}' in relay ${this.relay.url}. event received:`,
	        event
	      );
	    });
	  }
	  fire() {
	    this.relay.send('["REQ","' + this.id + '",' + JSON.stringify(this.filters).substring(1));
	    this.eoseTimeoutHandle = setTimeout(this.receivedEose.bind(this), this.eoseTimeout);
	  }
	  receivedEose() {
	    if (this.eosed)
	      return;
	    clearTimeout(this.eoseTimeoutHandle);
	    this.eosed = true;
	    this.oneose?.();
	  }
	  close(reason = "closed by caller") {
	    if (!this.closed && this.relay.connected) {
	      this.relay.send('["CLOSE",' + JSON.stringify(this.id) + "]");
	      this.closed = true;
	    }
	    this.relay.openSubs.delete(this.id);
	    this.onclose?.(reason);
	  }
	};

	// abstract-pool.ts
	var AbstractSimplePool = class {
	  relays = /* @__PURE__ */ new Map();
	  seenOn = /* @__PURE__ */ new Map();
	  trackRelays = false;
	  verifyEvent;
	  trustedRelayURLs = /* @__PURE__ */ new Set();
	  _WebSocket;
	  constructor(opts) {
	    this.verifyEvent = opts.verifyEvent;
	    this._WebSocket = opts.websocketImplementation;
	  }
	  async ensureRelay(url, params) {
	    url = normalizeURL(url);
	    let relay = this.relays.get(url);
	    if (!relay) {
	      relay = new AbstractRelay(url, {
	        verifyEvent: this.trustedRelayURLs.has(url) ? alwaysTrue : this.verifyEvent,
	        websocketImplementation: this._WebSocket
	      });
	      if (params?.connectionTimeout)
	        relay.connectionTimeout = params.connectionTimeout;
	      this.relays.set(url, relay);
	    }
	    await relay.connect();
	    return relay;
	  }
	  close(relays) {
	    relays.map(normalizeURL).forEach((url) => {
	      this.relays.get(url)?.close();
	    });
	  }
	  subscribeMany(relays, filters, params) {
	    return this.subscribeManyMap(Object.fromEntries(relays.map((url) => [url, filters])), params);
	  }
	  subscribeManyMap(requests, params) {
	    if (this.trackRelays) {
	      params.receivedEvent = (relay, id) => {
	        let set = this.seenOn.get(id);
	        if (!set) {
	          set = /* @__PURE__ */ new Set();
	          this.seenOn.set(id, set);
	        }
	        set.add(relay);
	      };
	    }
	    const _knownIds = /* @__PURE__ */ new Set();
	    const subs = [];
	    const relaysLength = Object.keys(requests).length;
	    const eosesReceived = [];
	    let handleEose = (i2) => {
	      eosesReceived[i2] = true;
	      if (eosesReceived.filter((a) => a).length === relaysLength) {
	        params.oneose?.();
	        handleEose = () => {
	        };
	      }
	    };
	    const closesReceived = [];
	    let handleClose = (i2, reason) => {
	      handleEose(i2);
	      closesReceived[i2] = reason;
	      if (closesReceived.filter((a) => a).length === relaysLength) {
	        params.onclose?.(closesReceived);
	        handleClose = () => {
	        };
	      }
	    };
	    const localAlreadyHaveEventHandler = (id) => {
	      if (params.alreadyHaveEvent?.(id)) {
	        return true;
	      }
	      const have = _knownIds.has(id);
	      _knownIds.add(id);
	      return have;
	    };
	    const allOpened = Promise.all(
	      Object.entries(requests).map(async (req, i2, arr) => {
	        if (arr.indexOf(req) !== i2) {
	          handleClose(i2, "duplicate url");
	          return;
	        }
	        let [url, filters] = req;
	        url = normalizeURL(url);
	        let relay;
	        try {
	          relay = await this.ensureRelay(url, {
	            connectionTimeout: params.maxWait ? Math.max(params.maxWait * 0.8, params.maxWait - 1e3) : void 0
	          });
	        } catch (err) {
	          handleClose(i2, err?.message || String(err));
	          return;
	        }
	        let subscription = relay.subscribe(filters, {
	          ...params,
	          oneose: () => handleEose(i2),
	          onclose: (reason) => handleClose(i2, reason),
	          alreadyHaveEvent: localAlreadyHaveEventHandler,
	          eoseTimeout: params.maxWait
	        });
	        subs.push(subscription);
	      })
	    );
	    return {
	      async close() {
	        await allOpened;
	        subs.forEach((sub) => {
	          sub.close();
	        });
	      }
	    };
	  }
	  subscribeManyEose(relays, filters, params) {
	    const subcloser = this.subscribeMany(relays, filters, {
	      ...params,
	      oneose() {
	        subcloser.close();
	      }
	    });
	    return subcloser;
	  }
	  async querySync(relays, filter, params) {
	    return new Promise(async (resolve) => {
	      const events = [];
	      this.subscribeManyEose(relays, [filter], {
	        ...params,
	        onevent(event) {
	          events.push(event);
	        },
	        onclose(_) {
	          resolve(events);
	        }
	      });
	    });
	  }
	  async get(relays, filter, params) {
	    filter.limit = 1;
	    const events = await this.querySync(relays, filter, params);
	    events.sort((a, b) => b.created_at - a.created_at);
	    return events[0] || null;
	  }
	  publish(relays, event) {
	    return relays.map(normalizeURL).map(async (url, i2, arr) => {
	      if (arr.indexOf(url) !== i2) {
	        return Promise.reject("duplicate url");
	      }
	      let r = await this.ensureRelay(url);
	      return r.publish(event).then((reason) => {
	        if (this.trackRelays) {
	          let set = this.seenOn.get(event.id);
	          if (!set) {
	            set = /* @__PURE__ */ new Set();
	            this.seenOn.set(event.id, set);
	          }
	          set.add(r);
	        }
	        return reason;
	      });
	    });
	  }
	  listConnectionStatus() {
	    const map = /* @__PURE__ */ new Map();
	    this.relays.forEach((relay, url) => map.set(url, relay.connected));
	    return map;
	  }
	  destroy() {
	    this.relays.forEach((conn) => conn.close());
	    this.relays = /* @__PURE__ */ new Map();
	  }
	};

	// pool.ts
	var _WebSocket;
	try {
	  _WebSocket = WebSocket;
	} catch {
	}
	var SimplePool = class extends AbstractSimplePool {
	  constructor() {
	    super({ verifyEvent, websocketImplementation: _WebSocket });
	  }
	};

	/* src\NostrEmbed.svelte generated by Svelte v4.2.19 */

	function create_else_block(ctx) {
		let p;

		return {
			c() {
				p = element("p");
				p.textContent = "Loading...";
			},
			m(target, anchor) {
				insert(target, p, anchor);
			},
			p: noop,
			d(detaching) {
				if (detaching) {
					detach(p);
				}
			}
		};
	}

	// (41:21) 
	function create_if_block_1(ctx) {
		let pre;
		let code;
		let t_value = JSON.stringify(/*nostrEvent*/ ctx[0], null, 2) + "";
		let t;

		return {
			c() {
				pre = element("pre");
				code = element("code");
				t = text(t_value);
			},
			m(target, anchor) {
				insert(target, pre, anchor);
				append(pre, code);
				append(code, t);
			},
			p(ctx, dirty) {
				if (dirty & /*nostrEvent*/ 1 && t_value !== (t_value = JSON.stringify(/*nostrEvent*/ ctx[0], null, 2) + "")) set_data(t, t_value);
			},
			d(detaching) {
				if (detaching) {
					detach(pre);
				}
			}
		};
	}

	// (39:0) {#if error}
	function create_if_block(ctx) {
		let p;
		let t;

		return {
			c() {
				p = element("p");
				t = text(/*error*/ ctx[1]);
				set_style(p, "color", "red");
			},
			m(target, anchor) {
				insert(target, p, anchor);
				append(p, t);
			},
			p(ctx, dirty) {
				if (dirty & /*error*/ 2) set_data(t, /*error*/ ctx[1]);
			},
			d(detaching) {
				if (detaching) {
					detach(p);
				}
			}
		};
	}

	function create_fragment(ctx) {
		let if_block_anchor;

		function select_block_type(ctx, dirty) {
			if (/*error*/ ctx[1]) return create_if_block;
			if (/*nostrEvent*/ ctx[0]) return create_if_block_1;
			return create_else_block;
		}

		let current_block_type = select_block_type(ctx);
		let if_block = current_block_type(ctx);

		return {
			c() {
				if_block.c();
				if_block_anchor = empty();
			},
			m(target, anchor) {
				if_block.m(target, anchor);
				insert(target, if_block_anchor, anchor);
			},
			p(ctx, [dirty]) {
				if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block.d(1);
					if_block = current_block_type(ctx);

					if (if_block) {
						if_block.c();
						if_block.m(if_block_anchor.parentNode, if_block_anchor);
					}
				}
			},
			i: noop,
			o: noop,
			d(detaching) {
				if (detaching) {
					detach(if_block_anchor);
				}

				if_block.d(detaching);
			}
		};
	}

	function instance($$self, $$props, $$invalidate) {
		let { noteId } = $$props;
		let nostrEvent = null;
		let error = null;

		async function getNote(realNoteId) {
			const pool = new SimplePool();
			let relays = ['wss://relay.damus.io', 'wss://nostr.mom/'];
			$$invalidate(0, nostrEvent = await pool.get(relays, { ids: [realNoteId] }));
		} //console.log(nostrEvent);

		if (noteId) {
			getNote(noteId);
		} else {
			error = 'Note ID not passed.';
		}

		$$self.$$set = $$props => {
			if ('noteId' in $$props) $$invalidate(2, noteId = $$props.noteId);
		};

		return [nostrEvent, error, noteId];
	}

	class NostrEmbed extends SvelteComponent {
		constructor(options) {
			super();
			init(this, options, instance, create_fragment, safe_not_equal, { noteId: 2 });
		}

		get noteId() {
			return this.$$.ctx[2];
		}

		set noteId(noteId) {
			this.$$set({ noteId });
			flush();
		}
	}

	customElements.define("nostr-embed", create_custom_element(NostrEmbed, {"noteId":{"attribute":"note-id"}}, [], [], true));

	return NostrEmbed;

})();
