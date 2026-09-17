// Types for the vendored `guacamole-keyboard.js`. Hand-written, because upstream ships no declarations
// for this file and the one field we most depend on (`modifiers`) is absent from every third-party d.ts
// we could have used instead.
//
// Only the surface F-035 actually uses is declared. Adding the rest would be describing code nobody calls.

/** Live state of the local modifier keys. Guacamole maintains it internally to decide `preventDefault`. */
export interface GuacamoleModifierState {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  hyper: boolean;
}

export interface GuacamoleKeyboardInterface {
  /**
   * Which modifiers are held right now.
   *
   * This is the field that decides whether a printable character takes the text path or the keysym path:
   * with Ctrl / Alt / Meta held, the browser treats the character as a *command* and swallows it, so the
   * `input` event never arrives and the text path loses the whole chord (spec §7.3).
   */
  modifiers: GuacamoleModifierState;

  /**
   * Fired when a key goes down on the element this keyboard listens to.
   *
   * @returns `true` to let the browser handle the event as well, `false` to cancel it.
   */
  onkeydown?: (keysym: number) => boolean;

  /** Fired when a key is released on the element this keyboard listens to. */
  onkeyup?: (keysym: number) => void;

  /** Mark a key pressed, firing `onkeydown`. */
  press: (keysym: number) => boolean;

  /** Mark a key released, firing `onkeyup`. */
  release: (keysym: number) => void;

  /** Type a whole string by pressing and releasing each character. */
  type: (text: string) => void;

  /**
   * Release every held key, firing `onkeyup` for each.
   *
   * This is the stuck-key remedy (spec §7.5): the keyboard knows what it still holds, so a reset emits the
   * `keyup` messages the browser never delivered.
   */
  reset: () => void;

  /**
   * Attach listeners to an element, translating its key / input / composition events into keysym-level
   * `onkeydown` / `onkeyup` callbacks.
   *
   * **There is no matching unbind** — upstream says so in its own comment ("Guacamole Keyboard does not
   * provide destroy functions"). Calling this twice on one element stacks two sets of listeners and sends
   * every keystroke twice, silently. Bind by callback ref, never in an effect keyed on changing state.
   */
  listenTo: (element: Element | Document) => void;
}

declare function GuacamoleKeyboard(element?: Element): GuacamoleKeyboardInterface;

export default GuacamoleKeyboard;
