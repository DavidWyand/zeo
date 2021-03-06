window.WebVRConfig = {
  CARDBOARD_UI_DISABLED: true,
  // FORCE_ENABLE_VR: false,
  ROTATE_INSTRUCTIONS_DISABLED: true,
  // PREDICTION_TIME_S: 0.040,
  TOUCH_PANNER_DISABLED: true,
  // YAW_ONLY: false,
  // MOUSE_KEYBOARD_CONTROLS_DISABLED: false,
  // DEFER_INITIALIZATION: false,
  // ENABLE_DEPRECATED_API: false,
  // BUFFER_SCALE: 0.5,
  // DIRTY_SUBMIT_FRAME_BINDINGS: false,
};
require('webvr-polyfill');
const {VRFrameData: VRFrameDataFake} = require('webvr-polyfill/src/base');
class VRPoseFake {
  constructor(position, orientation) {
    this.position = position;
    this.orientation = orientation;
  }
}

const SynchronousPromise = require('synchronous-promise').SynchronousPromise;
const mod = require('mod-loop');

const VREffect = require('./lib/three-extra/VREffect');

const DEFAULT_USER_HEIGHT = 1.6;
const DEFAULT_USER_IPD = 62 / 1000;
const DEFAULT_USER_FOV = 110;
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_ASPECT_RATIO = DEFAULT_WIDTH / DEFAULT_HEIGHT;

const CONTROLLER_DEFAULT_OFFSETS = [0.2, -0.1, -0.2];

const POSITION_SPEED = 0.05;
const POSITION_SPEED_FAST = POSITION_SPEED * 5;
const ROTATION_SPEED = 0.02 / (Math.PI * 2);

const BUTTONS = {
  PAD: 0,
  TRIGGER: 1,
  GRIP: 2,
  MENU: 3,
};

const SIDES = ['left', 'right'];

class EventSpec {
  constructor(buttonName, rootName, downName, upName) {
    this.buttonName = buttonName;
    this.rootName = rootName;
    this.downName = downName;
    this.upName = upName;
  }
}

const EVENT_SPECS = [
  new EventSpec('trigger', 'trigger', 'triggerdown', 'triggerup'),
  new EventSpec('pad', 'pad', 'paddown', 'padup'),
  new EventSpec('grip', 'grip', 'gripdown', 'gripup'),
  new EventSpec('menu', 'menu', 'menudown', 'menuup'),
];

class WebVR {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;

    let live = true;
    this._cleanup = () => {
      live = false;
    };

    return Promise.all([
      archae.requestPlugins([
        '/core/engines/hub',
        '/core/engines/input',
        '/core/engines/three',
        '/core/plugins/js-utils',
      ]),
      navigator.getVRDisplays(),
    ]).then(([
      [
        hub,
        input,
        three,
        jsUtils,
      ],
      displays,
    ]) => {
      if (live) {
        const {THREE, scene, camera, renderer} = three;
        const {domElement} = renderer;
        const {events} = jsUtils;
        const EventEmitter = events;

        const THREEVREffect = VREffect(THREE);

        const bestDisplay = displays.sort((a, b) => {
          const diff = +_isPolyfillDisplay(a) - _isPolyfillDisplay(b);
          if (diff !== 0) {
            return diff;
          } else {
            return +_canPresent(b) - +_canPresent(a);
          }
        })[0];

        const _getMatrixFromPose = (pose, stageMatrix) => {
          const position = (pose && pose.position !== null) ? new THREE.Vector3().fromArray(pose.position) : new THREE.Vector3(0, 0, 0);
          const rotation = (pose && pose.orientation !== null) ? new THREE.Quaternion().fromArray(pose.orientation) : new THREE.Quaternion(0, 0, 0, 1);
          const scale = new THREE.Vector3(1, 1, 1);
          const matrix = stageMatrix.clone().multiply(new THREE.Matrix4().compose(position, rotation, scale));
          return matrix;
        };
        const _getPropertiesFromMatrix = matrix => {
          const position = new THREE.Vector3();
          const rotation = new THREE.Quaternion();
          const scale = new THREE.Vector3();
          matrix.decompose(position, rotation, scale);
          return {
            position,
            rotation,
            scale,
          };
        };

        class HmdStatus {
          constructor(pose, position, rotation, scale) {
            this.pose = pose;
            this.position = position;
            this.rotation = rotation;
            this.scale = scale;
          }
        }
        class GamepadsStatus {
          constructor(left, right) {
            this.left = left;
            this.right = right;
          }
        }
        class GamepadStatus {
          constructor(pose, position, rotation, scale, buttons, axes) {
            this.pose = pose;
            this.position = position;
            this.rotation = rotation;
            this.scale = scale;
            this.buttons = buttons;
            this.axes = axes;
          }
        }
        class GamepadButtons {
          constructor(pad, trigger, grip, menu) {
            this.pad = pad;
            this.trigger = trigger;
            this.grip = grip;
            this.menu = menu;
          }
        }
        class GamepadButton {
          constructor(touched, pressed, value) {
            this.touched = touched;
            this.pressed = pressed;
            this.value = value;
          }
        }

        const _makeDefaultHmdStatus = () => new HmdStatus(
          null,
          camera.position.clone(),
          camera.quaternion.clone(),
          camera.scale.clone()
        );
        const _makeDefaultGamepadStatus = (stageMatrix, index) => {
          const pose = {
            position: [CONTROLLER_DEFAULT_OFFSETS[0] * ((index === 0) ? -1 : 1), CONTROLLER_DEFAULT_OFFSETS[1], CONTROLLER_DEFAULT_OFFSETS[2]],
            orientation: [0, 0, 0, 1],
          };
          const matrix = _getMatrixFromPose(pose, stageMatrix);
          const {position, rotation, scale} = _getPropertiesFromMatrix(matrix);

          const _makeDefaultButtonStatus = () => new GamepadButton(false, false, 0);
          const buttons = new GamepadButtons(
            _makeDefaultButtonStatus(),
            _makeDefaultButtonStatus(),
            _makeDefaultButtonStatus(),
            _makeDefaultButtonStatus()
          );
          const axes = [0, 0];

          return new GamepadStatus(
            pose,
            position,
            rotation,
            scale,
            buttons,
            axes
          );
        };

        class WebvrInstance extends EventEmitter {
          constructor() {
            super();

            this.display = null;
            this.stereoscopic = false;
            this.isOpen = false;
            this.isOpening = false;

            const stageMatrix = new THREE.Matrix4().makeTranslation(0, DEFAULT_USER_HEIGHT, 0);
            this.stageMatrix = stageMatrix;

            this.status = {
              hmd: _makeDefaultHmdStatus(),
              gamepads: new GamepadsStatus(
                _makeDefaultGamepadStatus(stageMatrix, 0),
                _makeDefaultGamepadStatus(stageMatrix, 1)
              ),
            };

            this._frameData = null;
          }

          supportsWebVR() {
            return _canPresent(bestDisplay);
          }

          requestRenderLoop({display = null, stereoscopic = false, update = () => {}, updateEye = () => {}, updateStart = () => {}, updateEnd = () => {}}) {
            let cleanups = [];
            const _destroy = () => {
              for (let i = 0; i < cleanups.length; i++) {
                const cleanup = cleanups[i];
                cleanup();
              }
              cleanups = [];
            };

            const result = new Promise((accept, reject) => {
              if (!this.isOpen) {
                let effect = null;

                const _initialize = () => {
                  this.display = display;
                  this.stereoscopic = stereoscopic;
                  this.isOpen = true;
                  cleanups.push(() => {
                    this.isOpen = false;
                  });

                  this._frameData = (display instanceof FakeVRDisplay) ? new VRFrameDataFake() : new VRFrameData();

                  if (display && stereoscopic) {
                    const {getVRDisplays} = navigator; // HACK to prevent VREffect from initializing VR displays
                    navigator.getVRDisplays = null;
                    effect = new THREEVREffect(renderer);
                    navigator.getVRDisplays = getVRDisplays;

                    effect.setVRDisplay(display);
                    effect.onEye = camera => {
                      updateEye(camera);
                    };
                    effect.isPresenting = true;
                    effect.autoSubmitFrame = false;

                    const resize = () => {
                      effect.setSize(window.innerWidth, window.innerHeight);
                    };
                    window.addEventListener('resize', resize);
                    window.addEventListener('vrdisplaypresentchange', resize);

                    cleanups.push(() => {
                      this.display = null;
                      this.stereoscopic = false;

                      effect = null;

                      renderer.setSize(window.innerWidth, window.innerHeight);
                      renderer.setPixelRatio(window.devicePixelRatio);

                      window.removeEventListener('resize', resize);
                      window.removeEventListener('vrdisplaypresentchange', resize);
                    });
                  }

                  const {stageMatrix} = this;
                  const userStageMatrix = new THREE.Matrix4().fromArray(hub.getUserState().matrix);
                  const displayStageMatrix = (display && display.stageParameters) ?
                    new THREE.Matrix4().fromArray(display.stageParameters.sittingToStandingTransform)
                  :
                    new THREE.Matrix4().makeTranslation(0, DEFAULT_USER_HEIGHT, 0);
                  const externalStageMatrix = userStageMatrix.clone().multiply(displayStageMatrix);
                  this.setStageMatrix(externalStageMatrix);
                  this.updateStatus();

                  cleanups.push(() => {
                    const {display} = this;

                    this.updateUserStageMatrix();
                    if (display) {
                      display.resetPoseHard();
                    }

                    this.setStageMatrix(new THREE.Matrix4());
                    this.updateStatus();

                    this._frameData = null;
                  });

                  const _renderLoop = () => {
                    const _render = () => {
                      updateStart(); // notify frame start

                      update(); // update plugins

                      if (effect) {
                        effect.render(scene, camera); // perform binocular render
                      } else {
                        updateEye(camera); // perform monocular eye render
                        renderer.render(scene, camera); // perform final render
                      }

                      updateEnd(); // notify frame end
                    };

                    const _requestAnimationFrame = fn => (display && display.isPresenting) ?
                      display.requestAnimationFrame(fn)
                    :
                      requestAnimationFrame(fn);
                    const _cancelAnimationFrame = animationFrame => (display && display.isPresenting) ?
                      display.cancelAnimationFrame(animationFrame)
                    :
                      cancelAnimationFrame(animationFrame);
                    const _submitFrame = pose => {
                      if (display && display.isPresenting) {
                        display.submitFrame(pose);
                      }
                    };

                    let animationFrame = null;
                    const _recurse = () => {
                      animationFrame = _requestAnimationFrame(() => {
                        animationFrame = null;

                        const status = this.updateStatus();
                        _render();
                        _submitFrame(status.hmd.pose);

                        _recurse();
                      });
                    };
                    _recurse();

                    cleanups.push(() => {
                      if (animationFrame) {
                        _cancelAnimationFrame(animationFrame);
                        animationFrame = null;
                      }
                    });
                  };
                  _renderLoop();
                };

                _initialize();

                const api = {
                  destroy: _destroy,
                };
                accept(api);
              } else {
                const err = new Error('webvr engine is already render looping. destroy() the old render first.');
                reject(err);
              }
            });
            result.destroy = _destroy;

            return result;
          };

          requestEnterVR({stereoscopic = true, update = () => {}, updateEye = () => {}, updateStart = () => {}, updateEnd = () => {}, onExit = () => {}}) {
            // NOTE: these promises *need* to be synchronous because the WebVR api can only be triggered in the same tick as a user action
            const _checkNotOpening = () => new SynchronousPromise((accept, reject) => {
              const {isOpening} = this;

              if (!isOpening) {
                accept();
              } else {
                const err = new Error('webvr engine is already entering vr');
                reject(err);
              }
            });
            const _startOpening = () => {
              this.isOpening = true;

              return SynchronousPromise.resolve();
            };
            const _stopOpening = () => {
              this.isOpening = false;

              return SynchronousPromise.resolve();
            };
            const _handleError = err => {
              _stopOpening();
              _destroy();

              return Promise.reject(err);
            };

            let cleanups = [];
            const _destroy = () => {
              for (let i = 0; i < cleanups.length; i++) {
                const cleanup = cleanups[i];
                cleanup();
              }
              cleanups = [];
            };

            const result = _checkNotOpening()
              .then(_startOpening)
              .then(() => {
                const display = (() => {
                  if (stereoscopic && _canPresent(bestDisplay)) {
                    return bestDisplay;
                  } else {
                    return new FakeVRDisplay();
                  }
                })();

                return display.requestPresent([
                  {
                    source: domElement,
                  }
                ])
                  .then(() => new Promise((accept, reject) => {
                    const _listen = () => {
                      if (display instanceof FakeVRDisplay) {
                        const pointerlockchange = () => {
                          const {isPresenting} = display;
                          if (!isPresenting) {
                            _destroy();

                            onExit();
                          }
                        };
                        document.addEventListener('pointerlockchange', pointerlockchange);

                        cleanups.push(() => {
                          display.destroy();

                          document.removeEventListener('pointerlockchange', pointerlockchange);
                        });
                      } else {
                        const vrdisplaypresentchange = () => {
                          const {isPresenting} = display;
                          if (!isPresenting) {
                            _destroy();

                            onExit();
                          }
                        };
                        document.addEventListener('vrdisplaypresentchange', vrdisplaypresentchange);

                        cleanups.push(() => {
                          document.removeEventListener('vrdisplaypresentchange', vrdisplaypresentchange);
                        });
                      }
                    };
                    const _requestRenderLoop = () => {
                      const renderLoopPromise = this.requestRenderLoop({
                        display,
                        stereoscopic,
                        update,
                        updateEye,
                        updateStart,
                        updateEnd,
                      });

                      cleanups.push(() => {
                        renderLoopPromise.destroy();
                      });

                      return renderLoopPromise;
                    };

                    _listen();

                    return _requestRenderLoop()
                      .then(_stopOpening)
                      .then(() => {
                        return {
                          destroy: _destroy,
                        };
                      })
                      .catch(_handleError);
                  }));
              })
              .catch(_handleError);
            result.destroy = _destroy;

            return result;
          }

          updateStatus() {
            const _getHmdStatus = ({stageMatrix}) => {
              const {display, _frameData: frameData} = this;
              if (display && frameData) {
                display.getFrameData(frameData);
              }
              const pose = frameData && frameData.pose;

              const matrix = _getMatrixFromPose(pose, stageMatrix);
              const {position, rotation, scale} = _getPropertiesFromMatrix(matrix);

              return new HmdStatus(
                pose,
                position,
                rotation,
                scale
              );
            };
            const _getGamepadsStatus = ({stageMatrix}) => {
              const {display} = this;
              const gamepads = (() => {
                if (display && display.getGamepads) {
                  const gamepads = display.getGamepads();
                  const [left, right] = gamepads;

                  return new GamepadsStatus(left, right);
                } else {
                  let left = null;
                  let right = null;

                  const gamepads = navigator.getGamepads();
                  for (let i = 0; i < gamepads.length; i++) {
                    const gamepad = gamepads[i];

                    if (gamepad) {
                      const {hand} = gamepad;

                      if (hand === 'left') {
                        left = gamepad;
                      } else if (hand === 'right') {
                        right = gamepad;
                      }
                    }
                  }

                  return new GamepadsStatus(left, right);
                }
              })();

              const _isGamepadAvailable = gamepad => Boolean(gamepad) && Boolean(gamepad.pose) && gamepad.pose.position !== null && gamepad.pose.orientation !== null;
              const _getGamepadPose = gamepad => {
                const {pose, buttons: [padButton, triggerButton, gripButton, menuButton], axes: [x, y]} = gamepad;

                const _getGamepadButtonStatus = button => {
                  if (button) {
                    const {touched, pressed, value} = button;
                    return new GamepadButton(touched, pressed, value);
                  } else {
                    return null;
                  }
                };

                const matrix = _getMatrixFromPose(pose, stageMatrix);
                const {position, rotation, scale} = _getPropertiesFromMatrix(matrix);
                const buttons = new GamepadButtons(
                  _getGamepadButtonStatus(padButton),
                  _getGamepadButtonStatus(triggerButton),
                  _getGamepadButtonStatus(gripButton),
                  _getGamepadButtonStatus(menuButton)
                );
                const axes = [x, y];

                return new GamepadStatus(
                  pose,
                  position,
                  rotation,
                  scale,
                  buttons,
                  axes
                );
              };

              return new GamepadsStatus(
                _isGamepadAvailable(gamepads.left) ? _getGamepadPose(gamepads.left) : null,
                _isGamepadAvailable(gamepads.right) ? _getGamepadPose(gamepads.right) : null
              );
            };

            const {status: oldStatus} = this;
            const stageMatrix = this.getStageMatrix();
            const newStatus = {
              hmd: _getHmdStatus({stageMatrix}),
              gamepads: _getGamepadsStatus({stageMatrix}),
            };
            this.setStatus(newStatus);

            SIDES.forEach(side => {
              const {gamepads: oldGamepadsStatus} = oldStatus;
              const oldGamepadStatus = oldGamepadsStatus[side];
              const {gamepads: newGamepadsStatus} = newStatus;
              const newGamepadStatus = newGamepadsStatus[side];

              EVENT_SPECS.forEach(({buttonName, rootName, downName, upName}) => {
                const oldPressed = Boolean(oldGamepadStatus) && oldGamepadStatus.buttons[buttonName].pressed;
                const newPressed = Boolean(newGamepadStatus) && newGamepadStatus.buttons[buttonName].pressed;

                if (!oldPressed && newPressed) {
                  input.triggerEvent(downName, {side});
                } else if (oldPressed && !newPressed) {
                  input.triggerEvent(upName, {side});
                  input.triggerEvent(rootName, {side});
                }
              });
            });

            return newStatus;
          }

          getDisplay() {
            return this.display;
          }

          getStatus() {
            return this.status;
          }

          setStatus(status) {
            this.status = status;
          }

          getStageMatrix() {
            return this.stageMatrix.clone();
          }

          setStageMatrix(stageMatrix) {
            this.stageMatrix.copy(stageMatrix);
          }

          updateUserStageMatrix() {
            const {display} = this;

            if (display) {
              const {stageMatrix} = this;
              const displayStageMatrix = (display && display.stageParameters) ?
                new THREE.Matrix4().fromArray(display.stageParameters.sittingToStandingTransform)
              :
                new THREE.Matrix4().makeTranslation(0, DEFAULT_USER_HEIGHT, 0);

              const userStageMatrix = stageMatrix.clone().multiply(new THREE.Matrix4().getInverse(displayStageMatrix));
              const {position: userPosition, rotation: userQuaternion, scale: userScale} = _getPropertiesFromMatrix(userStageMatrix);
              const userRotationY = new THREE.Euler().setFromQuaternion(userQuaternion, camera.rotation.order).y;

              const {_frameData: frameData} = this;
              display.getFrameData(frameData);
              const displayPosition = new THREE.Vector3().fromArray(frameData.pose.position);
              const displayQuaternion = new THREE.Quaternion().fromArray(frameData.pose.orientation);
              const displayRotationY = new THREE.Euler().setFromQuaternion(displayQuaternion, camera.rotation.order).y;

              const newUserStageMatrix = new THREE.Matrix4().compose(
                userPosition.clone().add(displayPosition.clone().applyQuaternion(userQuaternion)),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(0, userRotationY + displayRotationY, 0, camera.rotation.order)),
                userScale
              );

              hub.setUserStateMatrix(newUserStageMatrix.toArray());
            }
          }
        }

        class FakeVRDisplay extends EventEmitter {
          constructor() {
            super();

            this.canPresent = true;
            this.isPresenting = false;

            const sittingToStandingTransform = new THREE.Matrix4().makeTranslation(0, DEFAULT_USER_HEIGHT, 0);
            const standingToSittingTransform = new THREE.Matrix4().getInverse(sittingToStandingTransform);
            this.position = new THREE.Vector3();
            this.rotation = new THREE.Quaternion();
            this.scale = new THREE.Vector3(1, 1, 1);
            this.matrix = new THREE.Matrix4();

            this.stageParameters = {
              sittingToStandingTransform: sittingToStandingTransform.toArray(),
            };

            const keys = {
              up: false,
              down: false,
              left: false,
              right: false,
              pad: false,
              trigger: false,
              grip: false,
              menu: false,
              shift: false,
              alt: false,
            };
            this.keys = keys;

            const _resetKeys = () => {
              keys.up = false;
              keys.down = false;
              keys.left = false;
              keys.right = false;
              keys.pad = false;
              keys.trigger = false;
              keys.grip = false;
              keys.menu = false;
              keys.shift = false;
            };

            const gamepads = [new FakeVRGamepad(this, 0), new FakeVRGamepad(this, 1)];
            this.gamepads = gamepads;

            this.mode = 'move';

            const keydown = e => {
              if (this.isPresenting) {
                let needsGamepadUpdate = false;

                switch (e.keyCode) {
                  case 87: // W
                    keys.up = true;
                    break;
                  case 65: // A
                    keys.left = true;
                    break;
                  case 83: // S
                    keys.down = true;
                    break;
                  case 68: // D
                    keys.right = true;
                    break;
                  case 81: // Q
                    keys.pad = true;
                    needsGamepadUpdate = true;
                    break;
                  case 69: // E
                    keys.menu = true;
                    needsGamepadUpdate = true;
                    break;
                  case 70: // F
                    keys.grip = true;
                    needsGamepadUpdate = true;
                    break;
                  case 16: // shift
                    keys.shift = true;
                    break;
                  case 18: // alt
                    keys.alt = true;
                    needsGamepadUpdate = true;
                    break;
                  case 90: // Z
                    this.mode = 'left';
                    break;
                  case 88: // X
                    this.mode = 'move';
                    break;
                  case 67: // C
                    this.mode = 'right';
                    break;
                }

                if (needsGamepadUpdate) {
                  this.updateGamepads();
                }
              }
            };
            const keyup = e => {
              if (this.isPresenting) {
                let needsGamepadUpdate = false;

                switch (e.keyCode) {
                  case 87: // W
                    keys.up = false;
                    break;
                  case 65: // A
                    keys.left = false;
                    break;
                  case 83: // S
                    keys.down = false;
                    break;
                  case 68: // D
                    keys.right = false;
                    break;
                  case 81: // Q
                    keys.pad = false;
                    needsGamepadUpdate = true;
                    break;
                  case 69: // E
                    keys.menu = false;
                    needsGamepadUpdate = true;
                    break;
                  case 70: // F
                    keys.grip = false;
                    needsGamepadUpdate = true;
                    break;
                  case 16: // shift
                    keys.shift = false;
                    break;
                  case 18: // alt
                    keys.alt = false;
                    needsGamepadUpdate = true;
                    break;
                }

                if (needsGamepadUpdate) {
                  this.updateGamepads();
                }
              }
            };
            const mousedown = e => {
              if (this.isPresenting) {
                const {keys} = this;
                keys.trigger = true;

                this.updateGamepads();
              }
            };
            const mouseup = e => {
              if (this.isPresenting) {
                const {keys} = this;
                keys.trigger = false;

                this.updateGamepads();
              }
            };
            const mousemove = e => {
              if (this.isPresenting) {
                const {rotation: quaternion} = this;

                const rotation = new THREE.Euler().setFromQuaternion(quaternion, camera.rotation.order);
                rotation.x = Math.max(Math.min(rotation.x - e.movementY * ROTATION_SPEED, Math.PI / 2), -Math.PI / 2);
                rotation.y = mod(rotation.y - e.movementX * ROTATION_SPEED, Math.PI * 2);
                quaternion.setFromEuler(rotation);

                this.updateMatrix();
                this.updateGamepads();
              }
            };
            const pointerlockchange = e => {
              const {isPresenting: wasPresenting} = this;

              const isPresenting = document.pointerLockElement !== null;
              this.isPresenting = isPresenting;

              if (!isPresenting) {
                _resetKeys();
              }
            };
            const pointerlockerror = err => {
              _resetKeys();

              console.warn('pointer lock error', err);
            };

            input.on('keydown', keydown);
            input.on('keyup', keyup);
            input.on('mousedown', mousedown);
            input.on('mouseup', mouseup);
            input.on('mousemove', mousemove);
            document.addEventListener('pointerlockchange', pointerlockchange);
            document.addEventListener('pointerlockerror', pointerlockerror);

            this._cleanup = () => {
              for (let i = 0; i < gamepads.length; i++) {
                const gamepad = gamepads[i];
                gamepad.destroy();
              }

              input.removeListener('keydown', keydown);
              input.removeListener('keyup', keyup);
              input.removeListener('mousedown', mousedown);
              input.removeListener('mouseup', mouseup);
              input.removeListener('mousemove', mousemove);
              document.removeEventListener('pointerlockchange', pointerlockchange);
              document.removeEventListener('pointerlockerror', pointerlockerror);
            };
          }

          requestPresent(/*[{source}]*/) {
            domElement.requestPointerLock();

            return Promise.resolve();
          }

          requestAnimationFrame(fn) {
            return requestAnimationFrame(() => {
              const _updateDisplay = () => {
                const {position, rotation, keys} = this;

                const moveVector = new THREE.Vector3();
                const speed = keys.shift ? POSITION_SPEED_FAST : POSITION_SPEED;
                let moved = false;
                if (keys.up) {
                  moveVector.z -= speed;
                  moved = true;
                }
                if (keys.down) {
                  moveVector.z += speed;
                  moved = true;
                }
                if (keys.left) {
                  moveVector.x -= speed;
                  moved = true;
                }
                if (keys.right) {
                  moveVector.x += speed;
                  moved = true;
                }

                if (moved) {
                  moveVector.applyQuaternion(rotation);
                  position.add(moveVector);

                  this.updateMatrix();
                  this.updateGamepads();
                }
              };

              _updateDisplay();
              fn();
            });
          }

          cancelAnimationFrame(animationFrame) {
            cancelAnimationFrame(animationFrame);
          }

          resetPose() {
            this.position.set(0, 0, 0);
            const euler = new THREE.Euler().setFromQuaternion(this.rotation, camera.rotation.order);
            this.rotation.setFromEuler(new THREE.Euler(
              euler.x, // destinationRotation.x,
              0,
              euler.z, // destinationRotation.z,
              camera.rotation.order
            ));

            this.updateMatrix();
            this.updateGamepads();
          }

          resetPoseHard() {
            this.position.copy(new THREE.Vector3());
            this.rotation.copy(new THREE.Quaternion());

            this.updateMatrix();
            this.updateGamepads();
          }

          getFrameData(frameData) {
            const eyeCamera = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far);
            eyeCamera.fov = DEFAULT_USER_FOV;
            eyeCamera.aspect = DEFAULT_ASPECT_RATIO;
            eyeCamera.updateProjectionMatrix();
            const eyeCameraProjectionMatrixArray = eyeCamera.projectionMatrix.toArray();

            frameData.leftViewMatrix.set(new THREE.Matrix4().compose(
              camera.position.clone().add(new THREE.Vector3(-(DEFAULT_USER_IPD / 2), 0, 0).applyQuaternion(camera.quaternion)),
              camera.quaternion,
              camera.scale
            ).toArray());
            frameData.leftProjectionMatrix.set(eyeCameraProjectionMatrixArray);

            frameData.rightViewMatrix.set(new THREE.Matrix4().compose(
              camera.position.clone().add(new THREE.Vector3(DEFAULT_USER_IPD / 2, 0, 0).applyQuaternion(camera.quaternion)),
              camera.quaternion,
              camera.scale
            ).toArray());
            frameData.rightProjectionMatrix.set(eyeCameraProjectionMatrixArray);

            const {position, rotation} = this;
            frameData.pose = new VRPoseFake(position.toArray(), rotation.toArray());
          }

          getEyeParameters(side) {
            return {
              offset: [(DEFAULT_USER_IPD / 2) * (side === 'left' ? -1 : 1), 0, 0],
              fieldOfView: {
                upDegrees: DEFAULT_USER_FOV / 2,
                rightDegrees: DEFAULT_USER_FOV / 2,
                downDegrees: DEFAULT_USER_FOV / 2,
                leftDegrees: DEFAULT_USER_FOV / 2,
              },
              renderWidth: DEFAULT_WIDTH,
              renderHeight: DEFAULT_HEIGHT,
            };
          }

          getLayers() {
            return [
              {
                leftBounds: [0.0, 0.0, 0.5, 1.0],
                rightBounds: [0.5, 0.0, 0.5, 1.0],
                source: null,
              },
            ];
          }

          submitFrame(pose) {
            // nothing
          }

          getGamepads() {
            return this.gamepads;
          }

          getMode() {
            return this.mode;
          }

          updateMatrix() {
            const {position, rotation, scale, matrix} = this;

            matrix.compose(position, rotation, scale);
          }

          updateGamepads() {
            const {gamepads} = this;

            for (let i = 0; i < gamepads.length; i++) {
              const gamepad = gamepads[i];
              gamepad.updateProperties();
            }
          }

          destroy() {
            this._cleanup();
          }
        }

        class FakeVRGamepad {
          constructor(parent, index) {
            this._parent = parent;
            this._index = index;

            const position = new THREE.Vector3(0, 0, 0);
            this.position = position;
            const rotation = new THREE.Quaternion(0, 0, 0, 1);
            this.rotation = rotation;
            const scale = new THREE.Vector3(1, 1, 1);
            this.scale = scale;

            const buttons = (() => {
              const _makeButton = () => {
                return {
                  touched: false,
                  pressed: false,
                  value: 0,
                };
              };

              const numButtons = 4;
              const result = Array(numButtons);
              for (let i = 0; i < numButtons; i++) {
                result[i] = _makeButton();
              }
              return result;
            })();
            this.buttons = buttons;
            this.axes = [0, 0];

            const positionOffset = new THREE.Vector3(
              CONTROLLER_DEFAULT_OFFSETS[0] * (index === 0 ? -1 : 1),
              CONTROLLER_DEFAULT_OFFSETS[1],
              CONTROLLER_DEFAULT_OFFSETS[2]
            );
            this.positionOffset = positionOffset;

            const rotationOffset = new THREE.Euler();
            rotationOffset.order = camera.rotation.order;
            this.rotationOffset = rotationOffset;

            this.pose = {
              position: null,
              orientation: null,
            };

            this.updateProperties();

            const mousewheel = e => {
              if (this.displayIsInControllerMode()) {
                e.preventDefault();

                if (e.shiftKey) {
                  this.rotate(e.deltaX, e.deltaY);
                } else if (e.ctrlKey) {
                  this.move(0, 0, e.deltaY);
                } else if (e.altKey) {
                  this.touch(e.deltaX, e.deltaY);
                } else {
                  this.move(e.deltaX, e.deltaY, 0);
                }
              }
            };
            input.on('mousewheel', mousewheel);

            this._cleanup = () => {
              input.removeListener('mousewheel', mousewheel);
            };
          }

          displayIsInControllerMode() {
            const {_parent: parent, _index: index} = this;
            const mode = parent.getMode();
            return parent.isPresenting && ((mode === 'left' && index === 0) || (mode === 'right' && index === 1));
          }

          move(x, y, z) {
            const {positionOffset} = this;

            const moveFactor = 0.001;
            positionOffset.x += -x * moveFactor;
            positionOffset.y += y * moveFactor;
            positionOffset.z += -z * moveFactor;

            this.updateProperties();
          }

          touch(x, y, z) {
            const {axes} = this;

            const _clampAxis = v => Math.min(Math.max(v, -1), 1);

            const moveFactor = 0.02;
            axes[0] = _clampAxis(axes[0] - (x * moveFactor));
            axes[1] = _clampAxis(axes[1] + (y * moveFactor));

            this.updateProperties();
          }

          rotate(x, y) {
            const {rotationOffset} = this;

            const moveFactor = 0.001 * (Math.PI * 2);
            rotationOffset.y = Math.max(Math.min(rotationOffset.y + (x * moveFactor), Math.PI / 2), -Math.PI / 2);
            rotationOffset.x = Math.max(Math.min(rotationOffset.x + (y * moveFactor), Math.PI / 2), -Math.PI / 2);

            this.updateProperties();
          }

          updateProperties() {
            const {_parent: parent, positionOffset, rotationOffset} = this;

            const {matrix: outerMatrix} = parent;
            const innerMatrix = (() => {
              const result = new THREE.Matrix4();

              const position = positionOffset;
              const rotation = new THREE.Quaternion().setFromEuler(rotationOffset);
              const scale = new THREE.Vector3(1, 1, 1);
              result.compose(position, rotation, scale);

              return result;
            })();

            const worldMatrix = outerMatrix.clone().multiply(innerMatrix);
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            worldMatrix.decompose(position, rotation, scale);

            this.position.copy(position);
            this.rotation.copy(rotation);
            this.scale.copy(scale);

            this.pose.position = position.toArray();
            this.pose.orientation = rotation.toArray();

            if (this.displayIsInControllerMode()) {
              const {keys} = parent;
              this.buttons[BUTTONS.PAD].touched = keys.alt;
              this.buttons[BUTTONS.PAD].pressed = keys.pad;
              this.buttons[BUTTONS.TRIGGER].pressed = keys.trigger;
              this.buttons[BUTTONS.GRIP].pressed = keys.grip;
              this.buttons[BUTTONS.MENU].pressed = keys.menu;
            }
          }

          destroy() {
            this._cleanup();
          }
        }

        const webvrInstance = new WebvrInstance();
        return webvrInstance;
      }
    });
  }

  unmount() {
    this._cleanup();
  }
}

const _isPolyfillDisplay = vrDisplay => /polyfill/i.test(vrDisplay.displayName);
const _canPresent = vrDisplay => vrDisplay.capabilities.canPresent;

module.exports = WebVR;
