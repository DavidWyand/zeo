class Zeo {
  constructor(archae) {
    this._archae = archae;
  }

  mount() {
    const {_archae: archae} = this;

    let live = true;
    this._cleanup = () => {
      live = false;
    };

    return archae.requestEngines([
      '/core/engines/three',
      '/core/engines/somnifer',
      '/core/engines/antikyth',
    ]).then(([
      three,
      somnifer,
      antikyth,
    ]) => {
      if (live) {
        const {THREE, scene, camera, renderer} = three;
        const {sound} = somnifer;

        const worlds = new Map();
        let world = null;

        const _getCurrentWorld = () => world;
        const _requestChangeWorld = worldName => new Promise((accept, reject) => {
          const world = worlds.get(worldName);

          if (world) {
            accept(world);
          } else {
            antikyth.requestWorld(worldName)
              .then(physics => {
                const plugins = new Map();

                const _requestMod = modSpec => new Promise((accept, reject) => {
                  archae.requestPlugin(modSpec)
                    .then(plugin => {
                      const pluginName = archae.getName(plugin);
                      plugins.set(pluginName, plugin);

                      accept(plugin);
                    })
                    .catch(reject);
                });
                const _requestMods = modSpecs => {
                  const modPromises = modSpecs.map(_requestMod);
                  return Promise.all(modPromises);
                };
                const _destroy = () => {
                  if (animationFrame) {
                    cancelAnimationFrame(animationFrame);
                  }
                };

                const startTime = Date.now()
                let animationFrame = null;
                const _recurse = () => {
                  animationFrame = requestAnimationFrame(() => {
                    animationFrame = null;

                    const now = Date.now();
                    const worldTime = now - startTime;

                    const updateOptions = {
                      worldTime,
                    };
                    plugins.forEach(plugin => {
                      if (typeof plugin.update === 'function') {
                        plugin.update(updateOptions);
                      }
                    });

                    renderer.render(scene, camera);

                    _recurse();
                  });
                };
                _recurse();

                const world = {
                  requestMod: _requestMod,
                  requestMods: _requestMods,
                  physics,
                  destroy: _destroy,
                };

                worlds.set(worldName, world);

                accept(world);
              })
              .catch(reject);
          }
        }).then(newWorld => {
          world = newWorld;

          return newWorld;
        });

        this._cleanup = () => {
          worlds.forEach(world => {
            world.destroy();
          });
        };

        return {
          THREE,
          scene,
          camera,
          renderer,
          sound,
          getCurrentWorld: _getCurrentWorld,
          requestChangeWorld: _requestChangeWorld,
        };
      }
    });
  }

  unmount() {
    this._cleanup();
  }
}

module.exports = Zeo;
