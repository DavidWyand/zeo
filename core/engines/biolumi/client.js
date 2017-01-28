import FontFaceObserver from 'fontfaceobserver';

import menuShaders from './lib/shaders/menu';

const MAX_NUM_TEXTURES = 16;
const TRANSITION_TIME = 1000;

class Biolumi {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;

    let live = true;
    const cleanups = [];
    this._cleanup = () => {
      live = false;

      for (let i = 0; i < cleanups.length; i++) {
        const cleanup = cleanups[i];
        cleanup();
      }
    };

    const style = document.createElement('style');
    style.innerHTML = styleTagSrc;
    document.head.appendChild(style);
    cleanups.push(() => {
      document.head.removeChild(style);
    });

    const _requestFont = () => {
      return new FontFaceObserver('Open Sans', {
        weight: 300,
      }).load();
    };
    const _requestTransparentImg = () => new Promise((accept, reject) => {
      const img = new Image();
      img.src = transparentImgUrl;
      img.onload = () => {
        accept(img);
      };
      img.onerror = err => {
        reject(err);
      };
    });

    return Promise.all([
      archae.requestPlugins([
        '/core/engines/three',
        '/core/engines/anima',
        '/core/plugins/geometry-utils',
      ]),
      _requestFont(),
      _requestTransparentImg(),
    ])
      .then(([
        [
          three,
          anima,
          geometryUtils,
        ],
        font,
        transparentImg,
      ]) => {
        if (live) {
          const {THREE} = three;

          const _requestUi = ({width, height}) => new Promise((accept, reject) => {
            const pages = [];

            class Page {
              constructor(spec, type) {
                this.spec = spec;
                this.type = type;

                this.layers = [];

                this.x = 0;
                this.y = 0;

                this._lastStateJson = '';
              }

              update(state = null, cb = () => {}) {
                const stateJson = JSON.stringify(state);
                const {_lastStateJson: lastStateJson} = this;

                if (stateJson !== lastStateJson) {
                  this._lastStateJson = stateJson;

                  const {spec} = this;

                  const layers = [];
                  const layersSpec = typeof spec === 'function' ? spec(state) : spec;
                  if (layersSpec.length > 0) {
                    let pending = layersSpec.length;
                    const pend = () => {
                      if (--pending === 0) {
                        this.layers = layers;

                        cb();
                      }
                    };

                    for (let i = 0; i < layersSpec.length; i++) {
                      const layerSpec = layersSpec[i];
                      const {type = 'html'} = layerSpec;

                      if (type === 'html') {
                        const {src, x = 0, y = 0, w = width, h = height, scroll = false} = layerSpec;

                        const decoratedSrc = (() => {
                          const el = document.createElement('div');
                          el.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
                          el.setAttribute('style', rootCss);
                          el.innerHTML = src
                            .replace(/(<img\s+(?:(?!src=)[^>])*)(src=(?!['"]?data:)\S+)/g, '$1'); // optimization: do not load non-dataurl images

                          const imgs = el.querySelectorAll('img');

                          // do not load images without an explicit width + height
                          for (let i = 0; i < imgs.length; i++) {
                            const img = imgs[i];
                            if (!img.hasAttribute('width') || !img.hasAttribute('height')) {
                              img.parentNode.removeChild(img);
                            }
                          }

                          // remove empty anchors
                          const as = el.querySelectorAll('a');
                          for (let i = 0; i < as.length; i++) {
                            const a = as[i];
                            if (a.childNodes.length > 0) {
                              if (!a.style.textDecoration) {
                                a.style.textDecoration = 'underline';
                              }
                            } else {
                              a.parentNode.removeChild(a);
                            }
                          }

                          return new XMLSerializer().serializeToString(el);
                        })();

                        const innerSrc = styleTag + decoratedSrc;
                        const divEl = (() => {
                          const el = document.createElement('div');
                          el.style.cssText = 'position: absolute; top: 0; left: 0; width: ' + w + 'px;';
                          el.innerHTML = innerSrc;

                          return el;
                        })();
                        document.body.appendChild(divEl);

                        const {scrollHeight} = divEl;

                        const anchors = (() => {
                          const as = divEl.querySelectorAll('a');
                          const numAs = as.length;

                          const result = Array(numAs);
                          for (let i = 0; i < numAs; i++) {
                            const a = as[i];

                            const rect = a.getBoundingClientRect();
                            const onclick = a.getAttribute('onclick') || null;
                            const onmousedown = a.getAttribute('onmousedown') || null;
                            const onmouseup = a.getAttribute('onmouseup') || null;

                            const anchor = new Anchor(rect, onclick, onmousedown, onmouseup);
                            result[i] = anchor;
                          }

                          return result;
                        })();

                        document.body.removeChild(divEl);

                        const img = new Image();
                        img.src = 'data:image/svg+xml;charset=utf-8,' + '<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'' + w + '\' height=\'' + scrollHeight + '\'>' +
                          '<foreignObject width=\'100%\' height=\'100%\' x=\'0\' y=\'0\'>' +
                            innerSrc +
                          '</foreignObject>' +
                        '</svg>';
                        img.onload = () => {
                          layer.img = img;

                          pend();
                        };
                        img.onerror = err => {
                          console.warn('biolumi image load error', {innerSrc}, err);
                        };

                        const layer = new Layer(this);
                        layer.anchors = anchors;
                        layer.x = x;
                        layer.y = y;
                        layer.w = w;
                        layer.h = h;
                        layer.scrollHeight = scrollHeight;
                        layer.scroll = scroll;
                        layer.pixelated = false;
                        layers.push(layer);
                      } else if (type === 'image') {
                        let {img: imgs} = layerSpec;
                        if (!Array.isArray(imgs)) {
                          imgs = [imgs];
                        }
                        const {x = 0, y = 0, w = width, h = height, frameTime = 300, pixelated = false} = layerSpec;

                        setTimeout(pend);

                        for (let j = 0; j < imgs.length; j++) {
                          const img = imgs[j];

                          const layer = new Layer(this);
                          layer.img = img;
                          layer.x = x;
                          layer.y = y;
                          layer.w = w;
                          layer.h = h;
                          layer.scrollHeight = h;
                          layer.numFrames = imgs.length;
                          layer.frameIndex = j;
                          layer.frameTime = frameTime;
                          layer.pixelated = pixelated;
                          layers.push(layer);
                        }
                      } else {
                        throw new Error('unknown layer type: ' + type);
                      }
                    }
                  } else {
                    cb();
                  }
                } else {
                  cb();
                }
              }
            }

            class Layer {
              constructor(parent) {
                this.parent = parent;

                this.img = null;
                this.anchors = [];

                this.x = 0;
                this.y = 0;
                this.w = width;
                this.h = height;
                this.scrollHeight = height;
                this.scroll = false;
                this.scrollTop = 0;
                this.numFrames = 1;
                this.frameIndex = 0;
                this.frameTime = 0;
                this.pixelated = false;
              }

              getValid({worldTime}) {
                const {numFrames} = this;

                if (numFrames > 1) {
                  const {parent, frameIndex, frameTime} = this;
                  const currentFrameIndex = Math.floor(worldTime / frameTime) % numFrames;
                  return currentFrameIndex === frameIndex;
                } else {
                  return true; // XXX optimize this
                }
              }

              getPosition() {
                const {parent} = this;

                return new Position(
                  parent.x + (this.x / width),
                  parent.y + (this.y / height),
                  this.w / width,
                  this.h / height,
                  this.scrollTop / height,
                  this.scrollHeight / height
                );
              }

              getRect() {
                const position = this.getPosition();
                const {x: px, y: py, w: pw, h: ph} = position;

                return new Rect(
                  clamp(py * height, 0, height),
                  clamp((py + ph) * height, 0, height),
                  clamp(px * width, 0, width),
                  clamp((px + pw) * width, 0, width)
                );
              }

              getAnchors() {
                const position = this.getPosition();
                const {x: px, y: py, w: pw, h: ph} = position;

                return this.anchors.map(anchor => {
                  const {rect, onclick, onmousedown, onmouseup} = anchor;
                  const {top, bottom, left, right} = rect;

                  return new Anchor(
                    new Rect(
                      clamp((py * height) + top, 0, (py + ph) * height),
                      clamp((py * height) + bottom, 0, (py + ph) * height),
                      clamp((px * width) + left, 0, (px + pw) * width),
                      clamp((px * width) + right, 0, (px + pw) * width)
                    ),
                    onclick,
                    onmousedown,
                    onmouseup
                  );
                });
              }

              scrollTo(scrollTop) {
                this.scrollTop = scrollTop;
              }
            }

            class Anchor {
              constructor(rect, onclick, onmousedown, onmouseup) {
                this.rect = rect;
                this.onclick = onclick;
                this.onmousedown = onmousedown;
                this.onmouseup = onmouseup;
              }
            }

            class Position {
              constructor(x, y, w, h, st, sh) {
                this.x = x; // x position
                this.y = y; // y position
                this.w = w; // texture data width
                this.h = h; // texture data height
                this.st = st; // scroll top
                this.sh = sh; // scroll height
              }
            }

            class Rect {
              constructor(top, bottom, left, right) {
                this.top = top;
                this.bottom = bottom;
                this.left = left;
                this.right = right;
              }
            }

            const _applyPagePositions = (pages, pagePositions) => {
              for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const {x, y} = pagePositions[i];
                page.x = x;
                page.y = y;
              }
            };
            const _validatePages = pages => {
              for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                page.valid = true;
              }
            };
            const _invalidatePages = pages => {
              for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                page.valid = false;
              }
            };

            let transition = null;
            const _transition = ({pages, direction}, cb = () => {}) => {
              _cancelTransition();

              _validatePages(pages);

              let animationFrame = null;
              const animation = anima.makeAnimation(TRANSITION_TIME);
              const pageSchedule = (() => {
                if (direction === 'right') {
                  return [
                    {
                      start: 0,
                      end: -1,
                    },
                    {
                      start: 1,
                      end: 0,
                    },
                  ];
                } else if (direction === 'left') {
                  return [
                    {
                      start: -1,
                      end: 0,
                    },
                    {
                      start: 0,
                      end: 1,
                    },
                  ];
                } else {
                  return null;
                }
              })();
              const _recurse = () => {
                animationFrame = requestAnimationFrame(() => {
                  animationFrame = null;

                  const timeFactor = animation.getValue();
                  const pagePositions = pageSchedule.map(pageScheduleSpec => {
                    const {start, end} = pageScheduleSpec;

                    return {
                      x: start + (timeFactor * (end - start)),
                      y: 0,
                    };
                  });

                  _applyPagePositions(pages, pagePositions);

                  if (timeFactor < 1) {
                    _recurse();
                  } else {
                    _invalidatePages(pages.slice(0, -1));

                    cb();
                  }
                });
              };
              _recurse();

              const _cancel = () => {
                if (animationFrame) {
                  const endPagePositions = pageSchedule.map(pageScheduleSpec => {
                    const {end} = pageScheduleSpec;
                    return {
                      x: end,
                      y: 0,
                    };
                  });

                  _applyPagePositions(pages, endPagePositions);

                  cancelAnimationFrame(animationFrame);
                  animationFrame = null;

                  cb();
                }
              };
              transition = {
                cancel: _cancel,
              };
            };

            const _getPages = () => pages;
            const _getLayers = () => {
              const result = [];
              for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const {layers} = page;
                result.push.apply(result, layers);
              }
              return result;
            };
            const _pushPage = (spec, {type = null, state = null, immediate = false} = {}, {preCb = () => {}, postCb = () => {}} = {}) => {
              if (immediate) {
                _cancelTransition();
              }

              const page = new Page(spec, type);
              page.update(state, () => {
                preCb();

                pages.push(page);

                if (!immediate && pages.length > 1) {
                  _transition({
                    pages: pages.slice(-2),
                    direction: 'right',
                  }, postCb);
                } else {
                  postCb();
                }
              });
            };
            const _popPage = ({immediate = false} = {}, {preCb = () => {}, postCb = () => {}} = {}) => {
              preCb();

              if (!immediate && pages.length > 1) {
                _transition({
                  pages: pages.slice(-2),
                  direction: 'left',
                }, () => {
                  pages.pop();

                  postCb();
                });
              } else {
                _cancelTransition();

                pages.pop();

                postCb();
              }
            };
            const _replacePage = layersSpec => {
              _pushPage(layersSpec, {
                immediate: true,
              }, {
                preCb: () => {
                  _popPage({
                    immediate: true,
                  });
                }
              });
            };
            const _cancelTransition = () => {
              if (transition) {
                transition.cancel();
                transition = null;
              }
            };

            accept({
              getPages: _getPages,
              getLayers: _getLayers,
              pushPage: _pushPage,
              popPage: _popPage,
              replacePage: _replacePage,
              cancelTransition: _cancelTransition,
            });
          });
          const _getFonts = () => fonts;
          const _getFontWeight = () => fontWeight;
          const _getFontStyle = () => fontStyle;
          const _getTransparentImg = () => transparentImg;
          const _getMaxNumTextures = () => MAX_NUM_TEXTURES;

          const transparentMaterial = new THREE.MeshBasicMaterial({
            opacity: 0,
            transparent: true,
          });
          const _getTransparentMaterial = () => transparentMaterial;
          const solidMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF,
            opacity: 0.9,
            side: THREE.DoubleSide,
            transparent: true,
            // alphaTest: 0.5,
            depthWrite: false,
          });
          const _getSolidMaterial = () => solidMaterial;

          const _measureText = (() => {
            const measureContexts = {};

            const _makeMeasureContext = fontSpec => {
              const {fonts, fontSize, lineHeight, fontWeight, fontStyle} = fontSpec;

              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px/${lineHeight} ${fonts}`;

              return ctx;
            };
            const _getFontSpecKey = fontSpec => {
              const {fonts, fontSize, lineHeight, fontWeight, fontStyle} = fontSpec;
              return [fonts, fontSize, lineHeight, fontWeight, fontStyle].join(':');
            };
            const _getMeasureContext = fontSpec => {
              const key = _getFontSpecKey(fontSpec);
              let entry = measureContexts[key];
              if (!entry) {
                entry = _makeMeasureContext(fontSpec);
                measureContexts[key] = entry;
              }
              return entry;
            };

            return (text, fontSpec) => _getMeasureContext(fontSpec).measureText(text).width;
          })();
          const _getTextPropertiesFromCoord = (text, fontSpec, coordPx) => {
            const slices = (() => {
              const result = [];
              for (let i = 0; i <= text.length; i++) {
                const slice = text.slice(0, i);
                result.push(slice);
              }
              return result;
            })();
            const widths = slices.map(slice => _measureText(slice, fontSpec));
            const distances = widths.map(width => Math.abs(coordPx - width));
            const sortedDistances = distances
              .map((distance, index) => ([distance, index]))
              .sort(([aDistance], [bDistance]) => (aDistance - bDistance));

            const index = sortedDistances[0][1];
            const px = widths[index];

            return {index, px};
          };
          const _getTextPropertiesFromIndex = (text, fontSpec, index) => {
            const slice = text.slice(0, index);
            const px = _measureText(slice, fontSpec);

            return {index, px};
          };

          const _makeMenuHoverState = () => ({
            intersectionPoint: null,
            scrollLayer: null,
            anchor: null,
            value: 0,
            mousedownScrollLayer: null,
            mousedownStartCoord: null,
            mousedownStartScrollTop: null,
          });
          const menuShader = menuShaders.getShader({maxNumTextures: MAX_NUM_TEXTURES});
          const _makeMenuMaterial = () => {
            const shaderUniforms = THREE.UniformsUtils.clone(menuShader.uniforms);
            shaderUniforms.textures.value = (() => {
              const result = Array(MAX_NUM_TEXTURES);
              for (let i = 0; i < MAX_NUM_TEXTURES; i++) {
                const texture = new THREE.Texture(
                  transparentImg,
                  THREE.UVMapping,
                  THREE.ClampToEdgeWrapping,
                  THREE.ClampToEdgeWrapping,
                  THREE.LinearFilter,
                  THREE.LinearFilter,
                  THREE.RGBAFormat,
                  THREE.UnsignedByteType,
                  16
                );
                // texture.needsUpdate = true;

                result[i] = texture;
              }
              return result;
            })();
            shaderUniforms.validTextures.value = (() => {
              const result = Array(MAX_NUM_TEXTURES);
              for (let i = 0; i < MAX_NUM_TEXTURES; i++) {
                result[i] = 0;
              }
              return result;
            })();
            shaderUniforms.texturePositions.value = (() => {
              const result = Array(2 * MAX_NUM_TEXTURES);
              for (let i = 0; i < MAX_NUM_TEXTURES; i++) {
                result[(i * 2) + 0] = 0;
                result[(i * 2) + 1] = 0;
              }
              return result;
            })();
            shaderUniforms.textureLimits.value = (() => {
              const result = Array(2 * MAX_NUM_TEXTURES);
              for (let i = 0; i < MAX_NUM_TEXTURES; i++) {
                result[(i * 2) + 0] = 0;
                result[(i * 2) + 1] = 0;
              }
              return result;
            })();
            shaderUniforms.textureOffsets.value = (() => {
              const result = Array(MAX_NUM_TEXTURES);
              for (let i = 0; i < MAX_NUM_TEXTURES; i++) {
                result[i] = 0;
              }
              return result;
            })();
            shaderUniforms.textureDimensions.value = (() => {
              const result = Array(MAX_NUM_TEXTURES);
              for (let i = 0; i < MAX_NUM_TEXTURES; i++) {
                result[i] = 0;
              }
              return result;
            })();
            const shaderMaterial = new THREE.ShaderMaterial({
              uniforms: shaderUniforms,
              vertexShader: menuShader.vertexShader,
              fragmentShader: menuShader.fragmentShader,
              side: THREE.DoubleSide,
              transparent: true,
            });
            // shaderMaterial.polygonOffset = true;
            // shaderMaterial.polygonOffsetFactor = 1;
            return shaderMaterial;
          };

          const pointsHighlightMaterial = new THREE.PointsMaterial({
            color: 0xFF0000,
            size: 0.01,
          });
          const _makeMenuDotMesh = () => {
            const geometry = new THREE.BufferGeometry();
            geometry.addAttribute('position', new THREE.BufferAttribute(Float32Array.from([0, 0, 0]), 3));
            geometry.addAttribute('color', new THREE.BufferAttribute(Float32Array.from([0, 0, 0]), 3));
            const material = pointsHighlightMaterial;

            return new THREE.Points(geometry, material);
          };

          const wireframeHighlightMaterial = new THREE.MeshBasicMaterial({
            color: 0x0000FF,
            wireframe: true,
            opacity: 0.5,
            transparent: true,
          });
          const _makeMenuBoxMesh = () => {
            const geometry = new THREE.BoxBufferGeometry(1, 1, 1);

            const mesh = new THREE.Mesh(geometry, wireframeHighlightMaterial);
            mesh.visible = false;
            return mesh;
          };
          const _makeMeshPointGetter = ({position, rotation, width, height, worldWidth, worldHeight}) => (x, y, z) => position.clone()
            .add(
              new THREE.Vector3(
                -worldWidth / 2,
                worldHeight / 2,
                0
              )
              .add(
                new THREE.Vector3(
                  (x / width) * worldWidth,
                  (-y / height) * worldHeight,
                  z
                )
              ).applyQuaternion(rotation)
            );
          const _makeMeshCoordinateGetter = ({position, rotation, width, height, worldWidth, worldHeight}) => {
            const _getMenuMeshPoint = _makeMeshPointGetter({position, rotation, width, height, worldWidth, worldHeight});

            return intersectionPoint => {
              const x = (() => {
                const horizontalLine = new THREE.Line3(
                  _getMenuMeshPoint(0, 0, 0),
                  _getMenuMeshPoint(width, 0, 0)
                );
                const closestHorizontalPoint = horizontalLine.closestPointToPoint(intersectionPoint, true);
                return horizontalLine.start.distanceTo(closestHorizontalPoint);
              })();
              const y = (() => {
                const verticalLine = new THREE.Line3(
                  _getMenuMeshPoint(0, 0, 0),
                  _getMenuMeshPoint(0, height, 0)
                );
                const closestVerticalPoint = verticalLine.closestPointToPoint(intersectionPoint, true);
                return verticalLine.start.distanceTo(closestVerticalPoint);
              })();
              return new THREE.Vector2(x, y);
            };
          };
          const _updateAnchors = ({
            matrixObject,
            ui,
            hoverState,
            dotMesh,
            boxMesh,
            width,
            height,
            worldWidth,
            worldHeight,
            worldDepth,
            controllerPosition,
            controllerRotation,
          }) => {
            const {position, rotation, scale} = matrixObject;
            const controllerRay = new THREE.Vector3(0, 0, -1)
              .applyQuaternion(controllerRotation);
            const controllerLine = new THREE.Line3(
              controllerPosition.clone(),
              controllerPosition.clone().add(controllerRay.clone().multiplyScalar(15))
            );

            const menuBoxTarget = geometryUtils.makeBoxTarget(
              position,
              rotation,
              scale,
              new THREE.Vector3(worldWidth, worldHeight, 0)
            );
            const menuIntersectionPoint = menuBoxTarget.intersectLine(controllerLine);
            if (menuIntersectionPoint) {
              hoverState.intersectionPoint = menuIntersectionPoint;

              const _getMenuMeshPoint = _makeMeshPointGetter({
                position,
                rotation,
                width,
                height,
                worldWidth,
                worldHeight,
                worldDepth,
              });

              const scrollLayerBoxTargets = ui.getLayers()
                .filter(layer => layer.scroll)
                .map(layer => {
                  const rect = layer.getRect();
                  const scrollLayerBoxTarget = geometryUtils.makeBoxTargetOffset(
                    position,
                    rotation,
                    scale,
                    new THREE.Vector3(
                      -(worldWidth / 2) + (rect.left / width) * worldWidth,
                      (worldHeight / 2) + (-rect.top / height) * worldHeight,
                      -worldDepth
                    ),
                    new THREE.Vector3(
                      -(worldWidth / 2) + (rect.right / width) * worldWidth,
                      (worldHeight / 2) + (-rect.bottom / height) * worldHeight,
                      worldDepth
                    )
                  );
                  scrollLayerBoxTarget.layer = layer;
                  return scrollLayerBoxTarget;
                });
              const scrollLayerBoxTarget = (() => {
                for (let i = 0; i < scrollLayerBoxTargets.length; i++) {
                  const layerBoxTarget = scrollLayerBoxTargets[i];
                  if (layerBoxTarget.intersectLine(controllerLine)) {
                    return layerBoxTarget;
                  }
                }
                return null;
              })();
              if (scrollLayerBoxTarget) {
                hoverState.scrollLayer = scrollLayerBoxTarget.layer;
              } else {
                hoverState.scrollLayer = null;
              }

              const anchorBoxTargets = (() => {
                const result = [];
                const layers = ui.getLayers();
                for (let i = 0; i < layers.length; i++) {
                  const layer = layers[i];
                  const anchors = layer.getAnchors();

                  for (let j = 0; j < anchors.length; j++) {
                    const anchor = anchors[j];
                    const {rect} = anchor;

                    const anchorBoxTarget = geometryUtils.makeBoxTargetOffset(
                      position,
                      rotation,
                      scale,
                      new THREE.Vector3(
                        -(worldWidth / 2) + (rect.left / width) * worldWidth,
                        (worldHeight / 2) + ((-rect.top + layer.scrollTop) / height) * worldHeight,
                        -worldDepth
                      ),
                      new THREE.Vector3(
                        -(worldWidth / 2) + (rect.right / width) * worldWidth,
                        (worldHeight / 2) + ((-rect.bottom + layer.scrollTop) / height) * worldHeight,
                        worldDepth
                      )
                    );
                    anchorBoxTarget.anchor = anchor;

                    result.push(anchorBoxTarget);
                  }
                }
                return result;
              })();
              const anchorBoxTarget = (() => {
                const interstectedAnchorBoxTargets = anchorBoxTargets.filter(anchorBoxTarget => anchorBoxTarget.intersectLine(controllerLine));

                if (interstectedAnchorBoxTargets.length > 0) {
                  return interstectedAnchorBoxTargets[0];
                } else {
                  return null;
                }
              })();
              if (anchorBoxTarget) {
                boxMesh.position.copy(anchorBoxTarget.position);
                boxMesh.quaternion.copy(anchorBoxTarget.quaternion);
                boxMesh.scale.set(Math.max(anchorBoxTarget.size.x, 0.001), Math.max(anchorBoxTarget.size.y, 0.001), Math.max(anchorBoxTarget.size.z, 0.001));

                const {anchor} = anchorBoxTarget;
                hoverState.anchor = anchor;
                hoverState.value = (() => {
                  const {rect} = anchor;
                  const horizontalLine = new THREE.Line3(
                    _getMenuMeshPoint(rect.left, (rect.top + rect.bottom) / 2, 0),
                    _getMenuMeshPoint(rect.right, (rect.top + rect.bottom) / 2, 0)
                  );
                  const closestHorizontalPoint = horizontalLine.closestPointToPoint(menuIntersectionPoint, true);
                  return new THREE.Line3(horizontalLine.start.clone(), closestHorizontalPoint.clone()).distance() / horizontalLine.distance();
                })();

                if (!boxMesh.visible) {
                  boxMesh.visible = true;
                }
              } else {
                hoverState.anchor = null;
                hoverState.value = 0;

                if (boxMesh.visible) {
                  boxMesh.visible = false;
                }
              }

              dotMesh.position.copy(menuIntersectionPoint);
              if (!dotMesh.visible) {
                dotMesh.visible = true;
              }
            } else {
              hoverState.intersectionPoint = null;
              hoverState.scrollLayer = null;
              hoverState.anchor = null;
              hoverState.value = 0;

              if (boxMesh.visible) {
                boxMesh.visible = false;
              }
              if (dotMesh.visible) {
                dotMesh.visible = false;
              }
            }
          };
          const _updateMenuMaterial = ({ui, menuMaterial, worldTime}) => {
            const {uniforms: {texture, textures, validTextures, texturePositions, textureLimits, textureOffsets, textureDimensions}} = menuMaterial;

            const layers = ui.getLayers();
            for (let i = 0; i < MAX_NUM_TEXTURES; i++) {
              const layer = i < layers.length ? layers[i] : null;

              if (layer && layer.getValid({worldTime})) {
                validTextures.value[i] = 1;

                const texture = textures.value[i];
                if (texture.image !== layer.img) {
                  texture.image = layer.img;
                  if (!layer.pixelated) {
                    texture.minFilter = THREE.LinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    texture.anisotropy = 16;
                  } else {
                    texture.minFilter = THREE.NearestFilter;
                    texture.magFilter = THREE.NearestFilter;
                    texture.anisotropy = 1;
                  }
                  texture.needsUpdate = true;

                  layer.img.needsUpdate = false;
                } else if (layer.img.needsUpdate) {
                  if (!layer.pixelated) {
                    texture.minFilter = THREE.LinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    texture.anisotropy = 16;
                  } else {
                    texture.minFilter = THREE.NearestFilter;
                    texture.magFilter = THREE.NearestFilter;
                    texture.anisotropy = 1;
                  }
                  texture.needsUpdate = true;

                  layer.img.needsUpdate = false;
                }

                const position = layer.getPosition();
                texturePositions.value[(i * 2) + 0] = position.x;
                texturePositions.value[(i * 2) + 1] = position.y;
                textureLimits.value[(i * 2) + 0] = position.w;
                textureLimits.value[(i * 2) + 1] = position.h;
                textureOffsets.value[i] = position.st;
                textureDimensions.value[i] = position.sh;
              } else {
                validTextures.value[i] = 0;
              }
            }
          };

          return {
            requestUi: _requestUi,
            getFonts: _getFonts,
            getFontWeight: _getFontWeight,
            getFontStyle: _getFontStyle,
            getTransparentImg: _getTransparentImg,
            getMaxNumTextures: _getMaxNumTextures,
            getTransparentMaterial: _getTransparentMaterial,
            getSolidMaterial: _getSolidMaterial,
            getTextPropertiesFromCoord: _getTextPropertiesFromCoord,
            getTextPropertiesFromIndex: _getTextPropertiesFromIndex,
            makeMenuHoverState: _makeMenuHoverState,
            makeMenuMaterial: _makeMenuMaterial,
            makeMenuDotMesh: _makeMenuDotMesh,
            makeMenuBoxMesh: _makeMenuBoxMesh,
            makeMeshPointGetter: _makeMeshPointGetter,
            makeMeshCoordinateGetter: _makeMeshCoordinateGetter,
            updateAnchors: _updateAnchors,
            updateMenuMaterial: _updateMenuMaterial,
          };
        }
      });
  }

  unmount() {
    this._cleanup();
  }
}

const fonts = '"Open Sans"';
const fontWeight = 300;
const fontStyle = 'normal';
const transparentImgUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const styleTagSrc = `\
@font-face {
  font-family: 'Open Sans';
  font-style: normal;
  font-weight: 300;
  src: local('Open Sans Light'), local('OpenSans-Light'), url(data:font/woff2;base64,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) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2212, U+2215, U+E0FF, U+EFFD, U+F000;
}
`;
const styleTag = `<style>${styleTagSrc}</style>`;
const rootCss = `margin: 0px; padding: 0px; height: 100%; width: 100%; font-family: ${fonts}; font-weight: ${fontWeight}; overflow: scroll; user-select: none;`;

const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

module.exports = Biolumi;
