const idUtils = require('./lib/idUtils');

const FRAME_RATE = 60;
const TICK_TIME = 1000 / FRAME_RATE;

class Bullet {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;

    let live = true;
    this._cleanup = () => {
      live = false;
    };

    return archae.requestPlugins([
      '/core/engines/hub',
      '/core/engines/three',
      '/core/engines/login',
      '/core/engines/servers',
      '/core/engines/rend',
      '/core/engines/config',
      '/core/plugins/js-utils',
    ]).then(([
      hub,
      three,
      login,
      servers,
      rend,
      config,
      jsUtils,
    ]) => {
      if (live) {
        const {THREE, scene} = three;
        const {events} = jsUtils;
        const {EventEmitter} = events;

        const debugMaterial = new THREE.MeshBasicMaterial({
          color: 0xFF0000,
          wireframe: true,
        });

        const _makePlaneDebugMesh = (dimensions, position, rotation, scale) => {
          const geometry = new THREE.PlaneBufferGeometry(1024, 1024);
          geometry.applyMatrix(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3().fromArray(dimensions)
          )));

          const mesh = new THREE.Mesh(geometry, debugMaterial);
          mesh.position.fromArray(position);
          mesh.quaternion.fromArray(rotation);
          mesh.scale.fromArray(scale);
          return mesh;
        };
        const _makeBoxDebugMesh = dimensions => {
          const geometry = new THREE.BoxBufferGeometry(dimensions[0], dimensions[1], dimensions[2]);
          const mesh = new THREE.Mesh(geometry, debugMaterial);
          return mesh;
        };
        const _makeSphereDebugMesh = size => {
          const geometry = new THREE.SphereBufferGeometry(size, 8, 8);
          const mesh = new THREE.Mesh(geometry, debugMaterial);
          return mesh;
        };
        const _makeBoundingBoxDebugMesh = points => {
          const bufferGeometry = new THREE.BufferGeometry();
          bufferGeometry.addAttribute('position', new THREE.BufferAttribute(Float32Array.from(points), 3));
          bufferGeometry.computeBoundingBox();
          const {boundingBox} = bufferGeometry;
          const w = boundingBox.max.x - boundingBox.min.x;
          const h = boundingBox.max.y - boundingBox.min.y;
          const d = boundingBox.max.z - boundingBox.min.z;
          const center = new THREE.Vector3(
            (boundingBox.min.x + boundingBox.max.x) / 2,
            (boundingBox.min.y + boundingBox.max.y) / 2,
            (boundingBox.min.z + boundingBox.max.z) / 2
          );

          const geometry = new THREE.BoxBufferGeometry(w, h, d);
          geometry.applyMatrix(new THREE.Matrix4().makeTranslation(center.x, center.y, center.z));

          const mesh = new THREE.Mesh(geometry, debugMaterial);
          return mesh;
        };
        const _makeConvexHullDebugMesh = _makeBoundingBoxDebugMesh;
        const _makeTriangleMeshDebugMesh = (points, position, rotation, scale) => {
          const mesh = _makeBoundingBoxDebugMesh(points, position, rotation, scale);
          mesh.position.fromArray(position);
          mesh.quaternion.fromArray(rotation);
          mesh.scale.fromArray(scale);
          return mesh;
        };
        const _makeCompoundDebugMesh = children => {
          const mesh = new THREE.Object3D();

          for (let i = 0; i < children.length; i++) {
            const child = children[i];

            const childMesh = (() => {
              const {type, position = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1]} = child;

              const result = (() => {
                switch (type) {
                  case 'plane': {
                    const {dimensions} = child;
                    return _makePlaneDebugMesh(dimensions);
                  }
                  case 'box': {
                    const {dimensions} = child;
                    return _makeBoxDebugMesh(dimensions);
                  }
                  case 'sphere': {
                    const {size} = child;
                    return _makeSphereDebugMesh(size);
                  }
                  case 'convexHull': {
                    const {points} = child;
                    return _makeConvexHullDebugMesh(points);
                  }
                  case 'triangleMesh': {
                    const {points} = child;
                    return _makeTriangleMeshDebugMesh(points);
                  }
                  default:
                    return null;
                }
              })();
              result.position.fromArray(position);
              result.quaternion.fromArray(rotation);
              result.scale.fromArray(scale);
              return result;
            })();
            mesh.add(childMesh);
          }

          return mesh;
        };

        class Entity {
          constructor(type, id = idUtils.makeId()) {
            this.type = type;
            this.id = id;

            this.debugMesh = null;
          }

          add(child) {
            const {id: parentId} = this;
            const {id: childId} = child;

            _request('add', [parentId, childId], _warnError);
          }

          addConnectionBound(child) {
            const {id: parentId} = this;
            const {id: childId} = child;

            _request('addConnectionBound', [parentId, childId], _warnError);
          }

          remove(child) {
            const {id: parentId} = this;
            const {id: childId} = child;

            _request('remove', [parentId, childId], _warnError);
          }

          removeConnectionBound() {
            // nothing
          }

          addDebug() {
            if (this.makeDebugMesh) {
              const debugMesh = this.makeDebugMesh();
              scene.add(debugMesh);

              this.debugMesh = debugMesh;
            }
          }

          removeDebug() {
            const {debugMesh} = this;

            if (debugMesh) {
              scene.remove(debugMesh);

              this.debugMesh = null;
            }
          }
        }

        /* class Engine extends Entity {
          constructor(opts = {}) {
            super('engine', opts.id);
          }
        } */

        class World extends Entity {
          constructor(opts = {}) {
            super('world', opts.id);

            const {type, id} = this;

            this.bodies = new Map();
            this.running = false;
            this.timeout = null;
          }

          add(object) {
            Entity.prototype.add.call(this, object);

            const {id: objectId} = object;
            this.bodies.set(objectId, object);

            const {physicsDebug} = config.getConfig();
            if (physicsDebug) {
              object.addDebug();
            }

            if (!this.running) {
              this.start();
            }
          }

          addConnectionBound(object) {
            Entity.prototype.addConnectionBound.call(this, object);

            const {id: objectId} = object;
            this.bodies.set(objectId, object);

            const {physicsDebug} = config.getConfig();
            if (physicsDebug) {
              object.addDebug();
            }

            if (!this.running) {
              this.start();
            }
          }

          remove(object) {
            Entity.prototype.remove.call(this, object);

            const {id: objectId} = object;
            this.bodies.delete(objectId);

            const {physicsDebug} = config.getConfig();
            if (physicsDebug) {
              object.removeDebug();
            }

            if (this.bodies.size === 0) {
              this.stop();
            }
          }

          removeConnectionBound(object) {
            Entity.prototype.removeConnectionBound.call(this, object);

            const {id: objectId} = object;
            this.bodies.delete(objectId);

            const {physicsDebug} = config.getConfig();
            if (physicsDebug) {
              object.removeDebug();
            }

            if (this.bodies.size === 0) {
              this.stop();
            }
          }

          start() {
            let lastUpdateTime = null;
            const _recurse = () => {
              const timeUntilNextUpdate = (() => {
                if (lastUpdateTime === null) {
                  return 0;
                } else {
                  const now = Date.now();
                  const timeSinceLastUpdate = now - lastUpdateTime;
                  return Math.max(TICK_TIME - timeSinceLastUpdate, 0);
                }
              })();

              const _requestUpdate = () => {
                _request('requestUpdate', [this.id], (err, updates) => {
                  if (!err) {
                    for (let i = 0; i < updates.length; i++) {
                      const update = updates[i];
                      const {id} = update;

                      const body = this.bodies.get(id);
                      if (body) {
                        const {position, rotation, linearVelocity, angularVelocity} = update;
                        body.update({position, rotation, linearVelocity, angularVelocity});
                      } else {
                        console.warn('invalid body update:', JSON.stringify(id));
                      }
                    }
                  } else {
                    console.warn(err);
                  }

                  lastUpdateTime = Date.now();

                  _recurse();
                });
              };

              if (timeUntilNextUpdate === 0) {
                _requestUpdate();
              } else {
                this.timeout = setTimeout(() => {
                  _requestUpdate();

                  this.timeout = null;
                }, timeUntilNextUpdate);
              }
            };
            _recurse();

            this.running = true;
          }

          stop() {
            if (this.timeout) {
              clearTimeout(this.timeout);
              this.timeout = null;
            }

            this.running = false;
          }

          destroy() {
            if (this.running) {
              this.stop();
            }
          }
        }

        class Body extends Entity {
          constructor(type, opts = {}) {
            super(type, opts.id);

            const {id} = this;

            const linearVelocity = new THREE.Vector3();
            if (opts.linearVelocity) {
              linearVelocity.fromArray(opts.linearVelocity);
            }
            this.linearVelocity = linearVelocity;

            const angularVelocity = new THREE.Vector3();
            if (opts.angularVelocity) {
              angularVelocity.fromArray(opts.angularVelocity);
            }
            this.angularVelocity = angularVelocity;

            this.object = null;

            _request('create', [type, id, _except(opts, ['id'])], _warnError);
          }

          update({position, rotation, linearVelocity, angularVelocity}) {
            const {object} = this;
            if (object) {
              object.position.fromArray(position);
              object.quaternion.fromArray(rotation);
            }

            this.linearVelocity.fromArray(linearVelocity);
            this.angularVelocity.fromArray(angularVelocity);

            const {physicsDebug} = config.getConfig();
            if (physicsDebug) {
              const {debugMesh} = this;

              if (debugMesh) {
                debugMesh.position.fromArray(position);
                debugMesh.quaternion.fromArray(rotation);
              }
            }
          }

          setObject(object) {
            this.object = object;

            // this.sync();
          }

          unsetObject() {
            this.object = null;
          }

          setPosition(position) {
            const {id} = this;

            _request('setPosition', [id, position], _warnError);
          }

          setRotation(rotation) {
            const {id} = this;

            _request('setRotation', [id, rotation], _warnError);
          }

          setLinearVelocity(linearVelocity) {
            const {id} = this;

            _request('setLinearVelocity', [id, linearVelocity], _warnError);
          }

          setAngularVelocity(angularVelocity) {
            const {id} = this;

            _request('setAngularVelocity', [id, angularVelocity], _warnError);
          }

          setLinearFactor(linearFactor) {
            const {id} = this;

            _request('setLinearFactor', [id, linearFactor], _warnError);
          }

          setAngularFactor(angularFactor) {
            const {id} = this;

            _request('setAngularFactor', [id, angularFactor], _warnError);
          }

          activate() {
            _request('activate', [this.id], _warnError);
          }

          deactivate() {
            _request('deactivate', [this.id], _warnError);
          }

          disableDeactivation() {
            _request('disableDeactivation', [this.id], _warnError);
          }

          setIgnoreCollisionCheck(targetBody, ignore) {
            _request('setIgnoreCollisionCheck', [this.id, targetBody.id, ignore], _warnError);
          }

          sync() {
            const {object} = this;

            this.setPosition(object.position.toArray());
            this.setRotation(object.quaternion.toArray());
            // this.setLinearVelocity([0, 0, 0]);
            // this.setAngularVelocity([0, 0, 0]);
            // this.activate();
          }
        }

        class Plane extends Body {
          constructor(opts = {}) {
            super('plane', opts);

            const {position = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1], dimensions} = opts;
            this.position = position;
            this.rotation = rotation;
            this.scale = scale;
            this.dimensions = dimensions;
          }

          makeDebugMesh() {
            const {position, rotation, scale, dimensions} = this;
            return _makePlaneDebugMesh(dimensions, position, rotation, scale);
          }
        }

        class Box extends Body {
          constructor(opts = {}) {
            super('box', opts);

            const {dimensions} = opts;
            this.dimensions = dimensions;
          }

          makeDebugMesh() {
            return _makeBoxDebugMesh(this.dimensions);
          }
        }

        class Sphere extends Body {
          constructor(opts = {}) {
            super('sphere', opts);

            const {size} = opts;
            this.size = size;
          }

          makeDebugMesh() {
            return _makeSphereDebugMesh(this.size);
          }
        }

        class ConvexHull extends Body {
          constructor(opts = {}) {
            super('convexHull', opts);

            const {points} = opts;
            this.points = points;
          }

          makeDebugMesh() {
            return _makeConvexHullDebugMesh(this.points);
          }
        }

        class TriangleMesh extends Body {
          constructor(opts = {}) {
            super('triangleMesh', opts);

            const {position = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1], points} = opts;
            this.position = position;
            this.rotation = rotation;
            this.scale = scale;
            this.points = points;
          }

          makeDebugMesh() {
            const {position, rotation, scale, points} = this;
            return _makeTriangleMeshDebugMesh(points, position, rotation, scale);
          }
        }

        class Compound extends Body {
          constructor(opts = {}) {
            super('compound', opts);

            const {position = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1], children} = opts;
            this.position = position;
            this.rotation = rotation;
            this.scale = scale;
            this.children = children;
          }

          makeDebugMesh() {
            const {position, rotation, scale, children} = this;

            const mesh = _makeCompoundDebugMesh(children);
            mesh.position.fromArray(position);
            mesh.quaternion.fromArray(rotation);
            mesh.scale.fromArray(scale);
            return mesh;
          }
        }

        class Constraint extends Entity {
          constructor(opts = {}) {
            super('constraint', opts.id);

            const {type, id} = this;
            const {bodyA: {id: bodyAId}, bodyB: {id: bodyBId}, pivotA = [0, 0, 0], pivotB = [0, 0, 0]} = opts;

            _request('create', [type, id, {bodyAId, bodyBId, pivotA, pivotB}], _warnError);
          }
        }

        const _makeBody = mesh => {
          const {geometry} = mesh;
          const {type} = geometry;

          switch (type) {
            case 'Plane':
            case 'PlaneBufferGeometry': {
              const position = mesh.position.toArray();
              const rotation = mesh.quaternion.toArray();

              return new Plane({
                position,
                rotation,
                dimensions: [0, 0, 1],
                mass: 1,
              });
            }
            case 'BoxGeometry':
            case 'BoxBufferGeometry': {
              const position = mesh.position.toArray();
              const rotation = mesh.quaternion.toArray();
              const {parameters: {width, height, depth}} = geometry;

              return new Box({
                position,
                rotation,
                dimensions: [width, height, depth],
                mass: 1,
              });
            }
            case 'SphereGeometry':
            case 'Sphere': {
              const position = mesh.position.toArray();
              const rotation = mesh.quaternion.toArray();
              const {parameters: {radius}} = geometry;

              return new Sphere({
                position,
                rotation,
                size: radius,
                mass: 1,
              });
            }
            default: throw new Error('unsupported mesh type: ' + JSON.stringify(type));
          }
        };
        const _makeConvexHullBody = mesh => {
          const position = mesh.position.toArray();
          const rotation = mesh.quaternion.toArray();
          const points = _getGeometryPoints(mesh.geometry);

          return new ConvexHull({
            position,
            rotation,
            points,
            mass: 1,
          });
        };
        const _makeTriangleMeshBody = mesh => {
          const position = mesh.position.toArray();
          const rotation = mesh.quaternion.toArray();
          const points = _getGeometryPoints(mesh.geometry);

          return new TriangleMesh({
            position,
            rotation,
            points,
            mass: 1,
          });
        };

        const _makeWorld = () => {
          const world = new World({
            id: 'world',
          });
          world.Plane = Plane;
          world.Box = Box;
          world.Sphere = Sphere;
          world.ConvexHull = ConvexHull;
          world.TriangleMesh = TriangleMesh;
          world.Compound = Compound;
          world.Constraint = Constraint;
          world.makeBody = _makeBody;
          world.makeConvexHullBody = _makeConvexHullBody;
          world.makeTriangleMeshBody = _makeTriangleMeshBody;
          return world;
        };
        const world = _makeWorld();

        let connection = null;
        const requestHandlers = new Map();
        const _request = (method, args, cb) => {
          if (bulletInstance.isConnected()) {
            const id = idUtils.makeId();

            const e = {
              method,
              args,
              id,
            };
            const es = JSON.stringify(e);
            connection.send(es);

            const requestHandler = (err, result) => {
              if (!err) {
                cb(null, result);
              } else {
                cb(err);
              }

              requestHandlers.delete(id);
            };
            requestHandlers.set(id, requestHandler);
          } else {
            const err = new Error('physics engine not connected');
            cb(err);
          }
        };

        const cleanups = [];
        const cleanup = () => {
          for (let i = 0; i < cleanups.length; i++) {
            const cleanup = cleanups[i];
            cleanup();
          }
          cleanups.length = 0;
        };

        let enabled = false;
        const _enable = () => { // XXX handle race conditions here
          enabled = true;
          cleanups.push(() => {
            enabled = false;
          });

          connection = new WebSocket('wss://' + hub.getCurrentServer().url + '/archae/bulletWs');
          connection.onopen = () => {
            bulletInstance.emit('connectServer');
          };
          connection.onclose = () => {
            bulletInstance.emit('disconnectServer');
          };
          connection.onerror = err => {
            console.warn(err);
          };
          connection.onmessage = msg => {
            const m = JSON.parse(msg.data);
            const {id} = m;

            const requestHandler = requestHandlers.get(id);
            if (requestHandler) {
              const {error, result} = m;
              requestHandler(error, result);
            } else {
              console.warn('unregistered handler:', JSON.stringify(id));
            }
          };

          cleanups.push(() => {
            connection.close();
          });
        };
        const _disable = () => {
          cleanup();
        };
        const _updateEnabled = () => {
          const connected = servers.isConnected();
          const loggedIn = !login.isOpen();
          const shouldBeEnabled = connected && loggedIn;

          if (shouldBeEnabled && !enabled) {
            _enable();
          } else if (!shouldBeEnabled && enabled) {
            _disable();
          };
        };
        const _connectServer = _updateEnabled;
        rend.on('connectServer', _connectServer);
        const _disconnectServer = _updateEnabled;
        rend.on('disconnectServer', _disconnectServer);
        const _login = _updateEnabled;
        rend.on('login', _login);
        const _logout = _updateEnabled;
        rend.on('logout', _logout);

        _updateEnabled();

        let debugEnabled = false;
        const _enablePhysicsDebugMesh = () => {
          world.bodies.forEach(body => {
            body.addDebug();
          });

          debugEnabled = true;
        };
        const _disablePhysicsDebugMesh = () => {
          world.bodies.forEach(body => {
            body.removeDebug();
          });

          debugEnabled = false;
        };
        const _config = config => {
          const {physicsDebug} = config;

          if (physicsDebug && !debugEnabled) {
            _enablePhysicsDebugMesh();
          } else if (!physicsDebug && debugEnabled) {
            _disablePhysicsDebugMesh();
          };
        };
        config.on('config', _config);

        const {physicsDebug} = config.getConfig();
        if (physicsDebug) {
          _enablePhysicsDebugMesh();
        }

        this._cleanup = () => {
          cleanup();

          rend.removeListener('connectServer', _connectServer);
          rend.removeListener('disconnectServer', _disconnectServer);
          rend.removeListener('login', _login);
          rend.removeListener('logout', _logout);

          config.removeListner('config', _config);
        };

        class BulletApi extends EventEmitter {
          isConnected() {
            return Boolean(connection) && connection.readyState === WebSocket.OPEN;
          }

          getPhysicsWorld() {
            return world;
          }
        }
        const bulletInstance = new BulletApi();

        return bulletInstance;
      }
    });
  }

  unmount() {
    this._cleanup();
  }
}

const _except = (o, excepts) => {
  const result = {};

  for (const k in o) {
    if (!excepts.includes(k)) {
      result[k] = o[k];
    }
  }

  return result;
};
const _getGeometryPoints = geometry => {
  if (!(geometry instanceof BufferGeometry)) {
    geometry = new THREE.BufferGeometry().fromGeometry(geometry);
  }
  return Array.from(geometry.getAttribute('position').array);
};
const _warnError = err => {
  if (err) {
    console.warn(err);
  }
};

module.exports = Bullet;
