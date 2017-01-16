const SIDES = ['left', 'right'];

class Backpack {
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
        const {THREE, scene, camera} = zeo;

        const _makeHoverState = () => ({
          target: null,
          gripped: false,
        });
        const hoverStates = {
          left: _makeHoverState(),
          right: _makeHoverState(),
        };
        const backpackState = {
          visible: true,
        };

        const mesh = (() => {
          const width = 0.5;
          const height = 0.1;
          const depth = 0.35;
          const thickness = 0.01;

          const outerMaterial = new THREE.MeshPhongMaterial({
            color: 0x333333,
          });
          const innerMaterial = new THREE.MeshPhongMaterial({
            color: 0x795548,
          });

          const object = new THREE.Mesh();
          object.position.set(1, 1, 1);
          object.visible = false;

          const bottom = new THREE.Mesh(
            new THREE.BoxBufferGeometry(width, thickness, depth)
              .applyMatrix(new THREE.Matrix4().makeTranslation(0, -(height / 2), 0))
              .applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, -(depth / 2) - (0.05 / 2) - (thickness / 2))),
            outerMaterial
          );
          object.add(bottom);

          const top = new THREE.Mesh(
            new THREE.BoxBufferGeometry(width, thickness, depth)
              .applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, depth / 2))
              .applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 4))
              .applyMatrix(new THREE.Matrix4().makeTranslation(0, height / 2, -(depth / 2)))
              .applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, -(depth / 2) - (0.05 / 2) - (thickness / 2))),
            outerMaterial
          );
          object.add(top);

          const left = new THREE.Mesh(
            new THREE.BoxBufferGeometry(thickness, height - thickness, depth)
              .applyMatrix(new THREE.Matrix4().makeTranslation(-(width / 2) + (thickness / 2), 0, 0))
              .applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, -(depth / 2) - (0.05 / 2) - (thickness / 2))),
            outerMaterial
          );
          object.add(left);

          const right = new THREE.Mesh(
            new THREE.BoxBufferGeometry(thickness, height - thickness, depth)
              .applyMatrix(new THREE.Matrix4().makeTranslation((width / 2) - (thickness / 2), 0, 0))
              .applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, -(depth / 2) - (0.05 / 2) - (thickness / 2))),
            outerMaterial
          );
          object.add(right);

          const back = new THREE.Mesh(
            new THREE.BoxBufferGeometry(width, height - thickness, thickness)
              .applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, -(depth / 2) + (thickness / 2)))
              .applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, -(depth / 2) - (0.05 / 2) - (thickness / 2))),
            outerMaterial
          );
          object.add(back);

          const front = new THREE.Mesh(
            new THREE.BoxBufferGeometry(width, height - thickness, thickness)
              .applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, (depth / 2)))
              .applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, -(depth / 2) - (0.05 / 2) - (thickness / 2))),
            outerMaterial
          );
          object.add(front);

          const handleFront = new THREE.Mesh(
            new THREE.BoxBufferGeometry(0.1, 0.01, 0.01)
              .applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, (depth / 2) + 0.05))
              .applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, -(depth / 2) - (0.05 / 2) - (thickness / 2))),
            outerMaterial
          );
          object.add(handleFront);

          const handleLeft = new THREE.Mesh(
            new THREE.BoxBufferGeometry(0.01, 0.01, 0.05)
              .applyMatrix(new THREE.Matrix4().makeTranslation(-(0.1 / 2) - (0.01 / 2), 0, (depth / 2) + (0.05 / 2) + (0.01 / 2)))
              .applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, -(depth / 2) - (0.05 / 2) - (thickness / 2))),
            outerMaterial
          );
          object.add(handleLeft);

          const handleRight = new THREE.Mesh(
            new THREE.BoxBufferGeometry(0.01, 0.01, 0.05)
              .applyMatrix(new THREE.Matrix4().makeTranslation((0.1 / 2) + (0.01 / 2), 0, (depth / 2) + (0.05 / 2) + (0.01 / 2)))
              .applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, -(depth / 2) - (0.05 / 2) - (thickness / 2))),
            outerMaterial
          );
          object.add(handleRight);

          /* const lid = new THREE.Mesh(
            new THREE.BoxBufferGeometry(width, thickness, depth / 2)
              .applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
              .applyMatrix(new THREE.Matrix4().makeTranslation(0, height, 0)),
            outerMaterial
          );
          object.add(lid); */

          return object;
        })();
        scene.add(mesh);

        const boxMesh = (() => {
          const geometry = new THREE.BoxBufferGeometry(0.12, 0.05, 0.05);
          const material = new THREE.MeshBasicMaterial({
            color: 0x0000FF,
            wireframe: true,
          });

          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(1, 1, 1);
          mesh.visible = false;
          return mesh;
        })();
        scene.add(boxMesh);

        const _update = e => {
          const {visible: backbackVisible} = backpackState;

          let showBoxMesh = false;
          SIDES.forEach(side => {
            const hoverState = hoverStates[side];
            const {gamepads} = zeo.getStatus();
            const gamepad = gamepads[side];

            if (gamepad) {
              const {gripped} = hoverState;
              const {position: controllerPosition, rotation: controllerRotation} = gamepad;

              const _isBehindCamera = position => {
                const nearPlaneDistance = 1;
                const farPlaneDistance = 15;

                const nearPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
                  new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion),
                  camera.position
                );
                const farPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
                  new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion),
                  camera.position.clone().add(new THREE.Vector3(0, 0, farPlaneDistance).applyQuaternion(camera.quaternion))
                );

                const closestNearPoint = nearPlane.projectPoint(position);
                const closestFarPoint = farPlane.projectPoint(position);

                const nearLine = new THREE.Line3(position, closestNearPoint);
                const farLine = new THREE.Line3(position, closestFarPoint);

                const nearDistance = nearLine.distance();
                const farDistance = farLine.distance();

                return nearDistance < nearPlaneDistance && farDistance < farPlaneDistance;
              };

              if (!gripped) {
                if (backbackVisible && controllerPosition.distanceTo(mesh.position) < 0.12) {
                  hoverState.target = 'handle';

                  showBoxMesh = true;
                } else {
                  if (_isBehindCamera(controllerPosition)) {
                    hoverState.target = 'back';
                  } else {
                    hoverState.target = null;
                  }
                }
              } else {
                mesh.position.copy(controllerPosition);
                mesh.quaternion.copy(controllerRotation);
                boxMesh.position.copy(controllerPosition);
                boxMesh.quaternion.copy(controllerRotation);

                if (_isBehindCamera(controllerPosition)) {
                  hoverState.target = 'back';
                } else {
                  hoverState.target = null;
                }
              }
            }
          });

          if (showBoxMesh && !boxMesh.visible) {
            boxMesh.visible = true;
          } else if (!showBoxMesh && boxMesh.visible) {
            boxMesh.visible = false;
          }
        };
        zeo.on('update', _update);

        const _gripdown = e => {
          const {side} = e;

          SIDES.forEach(side => {
            const hoverState = hoverStates[side];
            hoverState.gripped = false;
          });

          const hoverState = hoverStates[side];
          const {target} = hoverState;

          if (target) {
            hoverState.gripped = true;

            const otherSide = side === 'left' ? 'right' : 'left';
            const otherHoverState = hoverStates[otherSide];
            const {gripped: otherGripped} = otherHoverState;
            if (otherGripped) {
              otherHoverState.gripped = false;
            }

            if (target === 'back') {
              backpackState.visible = true;

              mesh.visible = true;

              hoverState.target = null;
            }
          }
        };
        zeo.on('gripdown', _gripdown);
        const _gripup = e => {
          const {side} = e;
          const hoverState = hoverStates[side];
          const {gripped} = hoverState;

          if (gripped) {
            hoverState.gripped = false;

            const {target} = hoverState;
            if (target === 'back') {
              backpackState.visible = false;

              mesh.visible = false;
            }
          }
        };
        zeo.on('gripup', _gripup);

        this._cleanup = () => {
          scene.remove(mesh);

          zeo.removeListener('update', _update);
          zeo.removeListener('gripdown', _gripdown);
          zeo.removeListener('gripup', _gripup);
        };
      }
    });
  }

  unmount() {
    this._cleanup();
  }
}

module.exports = Backpack;