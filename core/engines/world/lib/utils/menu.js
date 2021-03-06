const prettyBytes = require('pretty-bytes');

const zeoElementClasses = new Map();
const _makeZeoElementClass = ({tag, attributes, baseClass}) => {
  const attributeNames = Object.keys(attributes);

  class ZeoElement extends baseClass {
    get observedAttributes() {
      return attributeNames;
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (typeof super.attributeChangedCallback === 'function') {
        super.attributeChangedCallback(name, oldValue, newValue);
      }

      if (typeof super.attributeValueChangedCallback === 'function') {
        const attribute = attributes[name];
        const {type, min, max, step, options} = attribute;

        const _castValue = s => {
          if (s !== null) {
            return castValueStringToCallbackValue(s.replace(/^"([\s\S]*)"$/, '$1'), type, min, max, step, options);
          } else {
            return null;
          }
        }

        super.attributeValueChangedCallback(name, _castValue(oldValue), _castValue(newValue));
      }
    }
  }

  const ZeoElementConstructor = document.registerElement('z-' + tag, ZeoElement);
  return ZeoElementConstructor;
};
const makeZeoElement = ({tag, attributes, baseClass}) => {
  let zeoElementClass = zeoElementClasses.get(tag);
  if (!zeoElementClass) {
    zeoElementClass = _makeZeoElementClass({tag, attributes, baseClass});
    zeoElementClasses.set(tag, zeoElementClass);
  }

  const zeoElement = new zeoElementClass();

  for (const attributeName in attributes) {
    const attribute = attributes[attributeName];
    const {value: attributeValue} = attribute;
    zeoElement.setAttribute(attributeName, JSON.stringify(attributeValue));
  }

  return zeoElement;
};

class FakeFile {
  constructor(url) {
    this.url = url;
  }

  fetch({type} = {}) {
    const {url} = this;

    return fetch(url)
      .then(res => {
        switch (type) {
          case 'text': return res.text();
          case 'json': return res.json();
          case 'arrayBuffer': return res.arrayBuffer();
          case 'blob': return res.blob();
          default: return res.blob();
        }
      });
  }
}

const castValueStringToValue = (s, type, min, max, step, options) => {
  switch (type) {
    case 'matrix': {
      return _jsonParse(s);
    }
    case 'text': {
      return s;
    }
    case 'color': {
      const match = s.match(/^#?([a-f0-9]{3}(?:[a-f0-9]{3})?)$/i);
      if (match) {
        return '#' + match[1];
      } else {
        return null;
      }
    }
    case 'select': {
      if (options.includes(s)) {
        return s;
      } else {
        return null;
      }
    }
    case 'number': {
      const n = parseFloat(s);

      if (!isNaN(n) && n >= min && n <= max) {
        if (step > 0) {
          return Math.floor(n / step) * step;
        } else {
          return n;
        }
      } else {
        return null;
      }
    }
    case 'checkbox': {
      if (s === 'true') {
        return true;
      } else if (s === 'false') {
        return false;
      } else {
        return null;
      }
    }
    case 'file': {
      return s;
    }
    default: {
      return s;
    }
  }
};
const castValueStringToCallbackValue = (s, type, min, max, step, options) => {
  switch (type) {
    case 'file': {
      const url = /^\//.test(s) ? ('/archae/fs' + s) : s;
      return new FakeFile(url);
    }
    default:
      return castValueStringToValue(s, type, min, max, step, options);
  }
};
const castValueValueToString = (s, type) => {
  if (typeof s === 'string') {
    return s;
  } else {
    return JSON.stringify(s);
  }
};
const _jsonParse = s => {
  let error = null;
  let result;
  try {
    result = JSON.parse(s);
  } catch (err) {
    error = err;
  }
  if (!error) {
    return result;
  } else {
    return null;
  }
};

const debounce = fn => {
  let running = false;
  let queued = false;

  const _go = () => {
    if (!running) {
      running = true;

      fn(() => {
        running = false;

        if (queued) {
          queued = false;

          _go();
        }
      });
    } else {
      queued = true;
    }
  };
  return _go;
};

module.exports = {
  makeZeoElement,
  castValueStringToValue,
  castValueStringToCallbackValue,
  castValueValueToString,
  debounce,
};
