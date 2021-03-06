const {
  WIDTH,
  HEIGHT,
} = require('../constants/menu');

const getLoginSrc = ({username, password, inputIndex, inputValue, loading, error, focusType}) => {
  return `\
    <div style="position: relative; display: flex; width: ${WIDTH}px; height: ${HEIGHT}px; justify-content: center; align-items: center;">
      <div style="position: absolute; top: 0; left: 0; right: 0; display: flex; height: 100px; padding: 20px; background-color: #000; font-size: 40px; color: #FFF; box-sizing: border-box; align-items: center;">Zeo VR</div>
      <div style="width: 640px;">
        ${!loading ? `\
          ${error ? `\
            <div style="display: flex; position: absolute; left: 0; right: 0; margin-top: -100px; height: 80px; background-color: #F44336; color: #FFF; font-size: 40px; font-weight: 400; justify-content: center; align-items: center;">
              ${error === 'EINPUT' ? 'Enter a username and password.' : ''}
              ${error === 'EAUTH' ? 'Invalid username or password.' : ''}
            </div>
          ` : ''}
          <a style="position: relative; display: block; margin-bottom: 30px; background-color: #EEE; font-size: 40px; text-decoration: none;" onclick="login:focus:username">
            ${focusType === 'username' ? `<div style="position: absolute; width: 2px; top: 2px; bottom: 2px; left: ${inputValue}px; background-color: #333;"></div>` : ''}
            <div>${username}</div>
            ${!username ? `<div style="color: #AAA;">Username</div>` : ''}
          </a>
          <a style="position: relative; display: block; margin-bottom: 30px; background-color: #EEE; font-size: 40px; text-decoration: none;" onclick="login:focus:password">
            ${focusType === 'password' ? `<div style="position: absolute; width: 2px; top: 2px; bottom: 2px; left: ${inputValue}px; background-color: #333;"></div>` : ''}
            <div>${password}</div>
            ${!password ? `<div style="color: #AAA;">Password</div>` : ''}
          </a>
          <a style="display: inline-block; padding: 5px 30px; border: 1px solid #333; border-radius: 100px; color: #333; font-size: 40px; text-decoration: none; align-items: center; box-sizing: border-box;" onclick="login:submit">Log in</a>
        ` : `\
          <div style="font-size: 40px;">Loading...</div>
        `}
      </div>
    </div>
  `;
};

module.exports = {
  getLoginSrc,
};
