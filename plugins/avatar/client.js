const ConvexGeometry = require('./lib/three-extra/ConvexGeometry');

class Avatar {
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

        const THREEConvexGeometry = ConvexGeometry(THREE);

        const sqrt2 = Math.sqrt(2);
        const tetrahedronGeometry = (() => {
          const points = [
            new THREE.Vector3(0, 0.1, 0),
            new THREE.Vector3(-0.1, 0, -0.1),
            new THREE.Vector3(0.1, 0, -0.1),
            new THREE.Vector3(0, 0, 0.1 / sqrt2),
            new THREE.Vector3(0, -0.1, 0),
          ];
          return new THREEConvexGeometry(points);
        })();
        const triangleGeometry = (() => {
          const points = [
            new THREE.Vector3(-0.1, 0, -0.1),
            new THREE.Vector3(0.1, 0, -0.1),
            new THREE.Vector3(0, 0, 0.1 / sqrt2),
            new THREE.Vector3(0, -0.1, 0),
          ];
          return new THREEConvexGeometry(points);
        })();

        class AvatarElement extends HTMLElement {
          createdCallback() {
            const mesh = (() => {
              const result = new THREE.Object3D();

              const solidMaterial = new THREE.MeshPhongMaterial({
                color: 0xE91E63,
                shininess: 10,
                shading: THREE.FlatShading,
              });

              const head = (() => {
                const geometry = tetrahedronGeometry.clone();
                const material = solidMaterial;
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.y = 1.1;
                mesh.scale.y = 1.25;
                return mesh;
              })();
              result.add(head);
              result.head = head;

              const body = (() => {
                const geometry = triangleGeometry.clone();
                const material = solidMaterial;
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.y = 0.9;
                mesh.scale.set(2, 3, 1);
                return mesh;
              })();
              result.add(body);
              result.body = body;

              const leftArm = (() => {
                const geometry = tetrahedronGeometry.clone();
                const material = solidMaterial;
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.y = 0.65;
                mesh.position.x = -0.2;
                mesh.scale.set(0.5, 2.25, 0.5);
                return mesh;
              })();
              result.add(leftArm);
              result.body = leftArm;

              const rightArm = (() => {
                const geometry = tetrahedronGeometry.clone();
                const material = solidMaterial;
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.y = 0.65;
                mesh.position.x = 0.2;
                mesh.scale.set(0.5, 2.25, 0.5);
                return mesh;
              })();
              result.add(rightArm);
              result.body = rightArm;

              const leftLeg = (() => {
                const geometry = tetrahedronGeometry.clone();
                const material = solidMaterial;
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.y = 0.3;
                mesh.position.x = -0.1;
                mesh.scale.set(0.75, 3, 0.75);
                return mesh;
              })();
              result.add(leftLeg);
              result.body = leftLeg;

              const rightLeg = (() => {
                const geometry = tetrahedronGeometry.clone();
                const material = solidMaterial;
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.y = 0.3;
                mesh.position.x = 0.1;
                mesh.scale.set(0.75, 3, 0.75);
                return mesh;
              })();
              result.add(rightLeg);
              result.body = rightLeg;

              return result;
            })();
            scene.add(mesh);

            this._cleanup = () => {
              scene.remove(mesh);
            };
          }

          destructor() {
            this._cleanup();
          }
        }
        zeo.registerElement(this, AvatarElement);

        this._cleanup = () => {
          zeo.unregisterElement(this);
        };

        return {};
      }
    });
  }

  unmount() {
    this._cleanup();
  }
}

module.exports = Avatar;
