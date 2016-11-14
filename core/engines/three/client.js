const THREE = require('three');

const client = () => ({
  mount() {
    const scene = new THREE.Scene();

    const camera = (() => {
      const result = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.001, 100000);
      result.position.x = 0;
      result.position.y = 1.5;
      result.position.z = 0;
      result.rotation.order = CAMERA_ROTATION_ORDER;
      result.up = new THREE.Vector3(0, 1, 0);

      const target = new THREE.Vector3(0, 1.5, -0.1);
      result.lookAt(target);
      result.target = target;

      return result;
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      clearColor: 0xFFFFFF,
      clearAlpha: 0,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    window.document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', () => {
       camera.aspect = window.innerWidth / window.innerHeight;
       camera.updateProjectionMatrix();

       renderer.setSize(window.innerWidth, window.innerHeight);

       render();
    });

    return {
      scene,
      camera,
      renderer,
    };
  },
  unmount() {
    this._cleanup();
  },
});

module.exports = client;