class Camera {
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
    ]).then(([
      zeo,
    ]) => {
      if (live) {
        const {THREE, scene, camera, renderer} = zeo;

        const updates = [];
        const _update = () => {
          for (let i = 0; i < updates.length; i++) {
            const update = updates[i];
            update();
          }
        };

        const cameraElements = [];
        class CameraElement extends HTMLElement {
          createdCallback() {
            const cameraWidth = 0.2;
            const cameraHeight = 0.15;
            const cameraAspectRatio = cameraWidth / cameraHeight;
            const cameraDepth = 0.1;

            const renderTarget = (() => {
              const width = 1024;
              const height = width / cameraAspectRatio;
              const renderTarget = new THREE.WebGLRenderTarget(width, height, {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat,
              });
              return renderTarget;
            })();
            this.renderTarget = renderTarget;

            const mesh = (() => {
              const result = new THREE.Object3D();

              const wireframeMaterial = new THREE.MeshBasicMaterial({
                color: 0x000000,
                wireframe: true,
                opacity: 0.5,
                transparent: true,
              });

              const baseMesh = (() => {
                const geometry = new THREE.BoxBufferGeometry(cameraWidth, cameraHeight, cameraDepth);

                const material = wireframeMaterial;

                const mesh = new THREE.Mesh(geometry, material);
                return mesh;
              })();
              result.add(baseMesh);
              result.baseMesh = baseMesh;

              const lensMesh = (() => {
                const lensWidth = cameraWidth * 0.4;
                const lensHeight = lensWidth;
                const lensDepth = lensWidth;

                const geometry = (() => {
                  const result = new THREE.BoxBufferGeometry(lensWidth, lensHeight, lensDepth);
                  result.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, -(cameraDepth / 2) - (lensDepth / 2)));
                  return result;
                })();

                const material = wireframeMaterial;

                const mesh = new THREE.Mesh(geometry, material);
                return mesh;
              })();
              result.add(lensMesh);
              result.lensMesh = lensMesh;

              const screenMesh = (() => {
                const screenWidth = cameraWidth;
                const screenHeight = cameraHeight;
                const geometry = (() => {
                  const result = new THREE.PlaneBufferGeometry(screenWidth, screenHeight);
                  result.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, cameraDepth / 2));
                  return result;
                })();
                const material = (() => {
                  const result = new THREE.MeshBasicMaterial({
                    map: renderTarget.texture,
                  });
                  result.polygonOffset = true;
                  result.polygonOffsetFactor = -1;
                  return result;
                })();
                const mesh = new THREE.Mesh(geometry, material);
                return mesh;
              })();
              result.add(screenMesh);
              result.screenMesh = screenMesh;

              return result;
            })();
            scene.add(mesh);
            this.mesh = mesh;

            cameraElements.push(this);

            const sourceCamera = new THREE.PerspectiveCamera(45, cameraWidth / cameraHeight, camera.near, camera.far);

            const update = () => {
              const lensPosition = new THREE.Vector3();
              const lensRotation = new THREE.Quaternion();
              const lensScale = new THREE.Vector3();
              mesh.lensMesh.updateMatrixWorld();
              mesh.lensMesh.matrixWorld.decompose(lensPosition, lensRotation, lensScale);

              sourceCamera.position.copy(lensPosition);
              sourceCamera.quaternion.copy(lensRotation);

              mesh.visible = false;
              renderer.render(scene, sourceCamera, renderTarget);
              renderer.setRenderTarget(null);
              mesh.visible = true;
            };
            updates.push(update);

            this._cleanup = () => {
              scene.remove(mesh);

              cameraElements.splice(cameraElements.indexOf(this), 1);

              updates.splice(updates.indexOf(update), 1);
            };
          }

          destructor() {
            this._cleanup();
          }

          attributeValueChangedCallback(name, oldValue, newValue) {
            switch (name) {
              case 'position': {
                const {mesh} = this;

                mesh.position.set(newValue[0], newValue[1], newValue[2]);
                mesh.quaternion.set(newValue[3], newValue[4], newValue[5], newValue[6]);
                mesh.scale.set(newValue[7], newValue[8], newValue[9]);

                break;
              }
            }
          }

          requestImageData() {
            const {renderTarget} = this;
            const {width, height} = renderTarget;
            const buffer = new Uint8Array(width * height * 4);
            renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, buffer);

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, width, height);
            const {data: imageDataData} = imageData;
            imageDataData.set(buffer);
            ctx.putImageData(imageData, 0, 0);

            const dataUrl = canvas.toDataURL('image/png');
            return fetch(dataUrl)
              .then(res => res.blob());
          }
        }
        zeo.registerElement(this, CameraElement);

        const _paddown = e => {
          const {side} = e;

          const grabElement = zeo.getGrabElement(side);
          const cameraElement = cameraElements.find(cameraElement => cameraElement === grabElement);

          if (cameraElement) {
            e.stopImmediatePropagation();
          }
        };
        zeo.on('paddown', _paddown, {
          priority: 1,
        });
        const _padup = e => {
          const {side} = e;

          const grabElement = zeo.getGrabElement(side);
          const cameraElement = cameraElements.find(cameraElement => cameraElement === grabElement);

          if (cameraElement) {
            cameraElement.requestImageData()
              .then(blob => {
                blob.name = 'Screenshot-1.png';

                return zeo.createFile(blob)
                  .then(tagMesh => {
                    console.log('uploaded', tagMesh);
                  });
              })
              .catch(err => {
                console.warn(err);
              });

            e.stopImmediatePropagation();
          }
        };
        zeo.on('padup', _padup, {
          priority: 1,
        });

        zeo.on('update', _update);

        this._cleanup = () => {
          zeo.unregisterElement(this);

          zeo.removeListener('paddown', _paddown);
          zeo.removeListener('padup', _padup);

          zeo.removeListener('update', _update);
        };

        return {};
      }
    });
  }
}

module.exports = Camera;
