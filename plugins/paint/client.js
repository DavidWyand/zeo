const MAX_NUM_POINTS = 4 * 1024;
const POINT_FRAME_RATE = 20;
const SIZE = 0.02;

const SIDES = ['left', 'right'];

class Paint {
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
      '/core/engines/zeo',
      '/core/plugins/geometry-utils',
    ]).then(([
      zeo,
      geometryUtils,
    ]) => {
      if (live) {
        const {THREE, scene} = zeo;

        const planeUvs = geometryUtils.unindexBufferGeometry(new THREE.PlaneBufferGeometry(1, 1, 1, 1)).getAttribute('uv').array;

        const _requestImage = src => new Promise((accept, reject) => {
          const img = new Image();
          img.src = src;
          img.onload = () => {
            accept(img);
          };
          img.onerror = err => {
            reject(err);
          };
        });

        return _requestImage('/archae/paint/brushes/brush.png')
          .then(brushImg => {
            if (live) {
              class PaintElement extends HTMLElement {
                createdCallback() {
                  const mesh = (() => {
                    const geometry = new THREE.BufferGeometry();
                    const positions = new Float32Array(MAX_NUM_POINTS * 6 * 3);
                    geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));
                    const normals = new Float32Array(MAX_NUM_POINTS * 6 * 3);
                    geometry.addAttribute('normal', new THREE.BufferAttribute(normals, 3));
                    const colors = new Float32Array(MAX_NUM_POINTS * 6 * 3);
                    geometry.addAttribute('color', new THREE.BufferAttribute(colors, 3));
                    const uvs = new Float32Array(MAX_NUM_POINTS * 6 * 2);
                    geometry.addAttribute('uv', new THREE.BufferAttribute(uvs, 2));
                    geometry.setDrawRange(0, 0);

                    const texture = new THREE.Texture(
                      brushImg,
                      THREE.UVMapping,
                      THREE.ClampToEdgeWrapping,
                      THREE.ClampToEdgeWrapping,
                      THREE.NearestFilter,
                      THREE.NearestFilter,
                      THREE.RGBAFormat,
                      THREE.UnsignedByteType,
                      16
                    );
                    texture.needsUpdate = true;
                    const material = new THREE.MeshPhongMaterial({
                      map: texture,
                      // shininess: 10,
                      shininess: 0,
                      vertexColors: THREE.VertexColors,
                      side: THREE.DoubleSide,
                      transparent: true,
                      alphaTest: 0.5,
                    });

                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.drawMode = THREE.TriangleStripDrawMode;
                    mesh.frustumCulled = false;
                    return mesh;
                  })();
                  this.mesh = mesh;
                  scene.add(mesh);

                  const color = new THREE.Color(0xF44336);
                  this.color = color;

                  let lastPoint = 0;

                  const _makePaintState = () => ({
                    painting: false,
                    lastPointTime: 0,
                  });
                  const paintStates = {
                    left: _makePaintState(),
                    right: _makePaintState(),
                  };

                  const _triggerdown = e => {
                    const {side} = e;
                    const paintState = paintStates[side];
                    paintState.painting = true;
                  };
                  zeo.on('triggerdown', _triggerdown);
                  const _triggerup = e => {
                    const {side} = e;
                    const paintState = paintStates[side];
                    paintState.painting = false;
                  };
                  zeo.on('triggerup', _triggerup);

                  const _update = () => {
                    const {gamepads} = zeo.getStatus();
                    const worldTime = zeo.getWorldTime();

                    const _getFrame = t => Math.floor(t / POINT_FRAME_RATE);

                    SIDES.forEach(side => {
                      const paintState = paintStates[side];
                      const {painting} = paintState;

                      if (painting) {
                        const {lastPointTime} = paintState;
                        const lastFrame = _getFrame(lastPointTime);
                        const currentPointTime = worldTime;
                        const currentFrame = _getFrame(currentPointTime);

                        if (currentFrame > lastFrame) {
                          const positionsAttribute = mesh.geometry.getAttribute('position');
                          const normalsAttribute = mesh.geometry.getAttribute('normal');
                          const colorsAttribute = mesh.geometry.getAttribute('color');
                          const uvsAttribute = mesh.geometry.getAttribute('uv');

                          const positions = positionsAttribute.array;
                          const normals = normalsAttribute.array;
                          const colors = colorsAttribute.array;
                          const uvs = uvsAttribute.array;

                          const gamepad = gamepads[side];
                          const {position: controllerPosition, rotation: controllerRotation} = gamepad;

                          const brushSize = 0.1;
                          const direction = new THREE.Vector3(1, 0, 0)
                            .applyQuaternion(controllerRotation);
                          const posA = controllerPosition.clone()
                            .add(direction.clone().multiplyScalar(brushSize / 2));
                          const posB = controllerPosition.clone()
                            .add(direction.clone().multiplyScalar(-brushSize / 2));

                          // positions
                          const basePositionIndex = lastPoint * 2 * 3;
                          positions[basePositionIndex + 0] = posA.x;
                          positions[basePositionIndex + 1] = posA.y;
                          positions[basePositionIndex + 2] = posA.z;
                          positions[basePositionIndex + 3] = posB.x;
                          positions[basePositionIndex + 4] = posB.y;
                          positions[basePositionIndex + 5] = posB.z;

                          // normals
                          (() => {
                            const pA = new THREE.Vector3();
                            const pB = new THREE.Vector3();
                            const pC = new THREE.Vector3();
                            const cb = new THREE.Vector3();
                            const ab = new THREE.Vector3();

                            const idx = lastPoint * 6;
                            for (let i = 0, il = idx; i < il; i++) {
                              normals[i] = 0;
                            }

                            let pair = true;
                            for (let i = 0, il = idx; i < il; i += 3) {
                              if (pair) {
                                pA.fromArray(positions, i);
                                pB.fromArray(positions, i + 3);
                                pC.fromArray(positions, i + 6);
                              } else {
                                pA.fromArray(positions, i + 3);
                                pB.fromArray(positions, i);
                                pC.fromArray(positions, i + 6);
                              }
                              pair = !pair;

                              cb.subVectors(pC, pB);
                              ab.subVectors(pA, pB);
                              cb.cross(ab);
                              cb.normalize();

                              normals[i] += cb.x;
                              normals[i + 1] += cb.y;
                              normals[i + 2] += cb.z;

                              normals[i + 3] += cb.x;
                              normals[i + 4] += cb.y;
                              normals[i + 5] += cb.z;

                              normals[i + 6] += cb.x;
                              normals[i + 7] += cb.y;
                              normals[i + 8] += cb.z;
                            }

                            /*
                            first and last vertice (0 and 8) belongs just to one triangle
                            second and penultimate (1 and 7) belongs to two triangles
                            the rest of the vertices belongs to three triangles
                              1_____3_____5_____7
                              /\    /\    /\    /\
                             /  \  /  \  /  \  /  \
                            /____\/____\/____\/____\
                            0    2     4     6     8
                            */

                            // Vertices that are shared across three triangles
                            for (let i = 2 * 3, il = idx - 2 * 3; i < il; i++) {
                              normals[i] = normals[i] / 3;
                            }

                            // Second and penultimate triangle, that shares just two triangles
                            normals[3] = normals[3] / 2;
                            normals[3 + 1] = normals[3 + 1] / 2;
                            normals[3 + 2] = normals[3 * 1 + 2] / 2;

                            normals[idx - 2 * 3] = normals[idx - 2 * 3] / 2;
                            normals[idx - 2 * 3 + 1] = normals[idx - 2 * 3 + 1] / 2;
                            normals[idx - 2 * 3 + 2] = normals[idx - 2 * 3 + 2] / 2;

                            mesh.geometry.normalizeNormals();
                          })();

                          // colors
                          const {color} = this;
                          for (let i = 0; i < 2; i++) {
                            const baseColorIndex = basePositionIndex + (i * 3);

                            colors[baseColorIndex + 0] = color.r;
                            colors[baseColorIndex + 1] = color.g;
                            colors[baseColorIndex + 2] = color.b;
                          }

                          // uvs
                          for (i = 0; i <= lastPoint; i++) {
                            const baseUvIndex = i * 2 * 2;

                            uvs[baseUvIndex + 0] = i / (lastPoint - 1);
                            uvs[baseUvIndex + 1] = 0;
                            uvs[baseUvIndex + 2] = i / (lastPoint - 1);
                            uvs[baseUvIndex + 3] = 1;
                          }

                          positionsAttribute.needsUpdate = true;
                          normalsAttribute.needsUpdate = true;
                          colorsAttribute.needsUpdate = true;
                          uvsAttribute.needsUpdate = true;

                          lastPoint++;

                          const {geometry} = mesh;
                          geometry.setDrawRange(0, lastPoint * 2);

                          paintState.lastPointTime = lastPointTime;
                        }
                      }
                    });
                  };
                  zeo.on('update', _update);

                  this._cleanup = () => {
                    scene.remove(mesh);

                    zeo.removeListener('triggerdown', _triggerdown);
                    zeo.removeListener('triggerup', _triggerup);
                    zeo.removeListener('update', _update);
                  };
                }

                destructor() {
                  this._cleanup();
                }

                attributeValueChangedCallback(name, oldValue, newValue) {
                  switch (name) {
                    case 'color': {
                      this.color = new THREE.Color(newValue);

                      break;
                    }
                  }
                }
              }
              zeo.registerElement(this, PaintElement);

              this._cleanup = () => {
                zeo.unregisterElement(this);
              };

              return {};
            }
          });
      }
    });
  }

  unmount() {
    this._cleanup();
  }
}

module.exports = Paint;
