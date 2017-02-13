const timeago = require('time-ago')();
const karmaIcon = require('../img/karma-white');
const karmaIconSrc = 'data:image/svg+xml;base64,' + btoa(karmaIcon);

const makeRenderer = ({creatureUtils}) => {

const getAdventureSrc = ({id, name, author, created}) => `\
  <div style="background-color: #FFF;">
    <div style="padding-left: 30px; background-color: #000; color: #FFF; font-size: 40px; line-height: 80px;">
      <div style="display: inline-flex; width: 300px; float: right; background: #4CAF50; color: #FFF; font-size: 30px; justify-content: center; align-items: center; box-sizing: border-box; box-sizing: border-box;">
        <img src="${karmaIconSrc}" width=34 height=34 style="margin-right: 10px;"> 350
      </div>
      <div>${name}</div>
    </div>
    <div style="padding: 5px 10px;">
      <div style="display: inline-flex; padding: 10px 20px; background-color: #EEE; border-radius: 100px; margin-bottom: 20px; font-size: ${30 / 1.4}px; line-height: 1.4;">
        <img src="${creatureUtils.makeStaticCreature('user:' + author)}" width="30" height="30" style="margin-right: 10px; image-rendering: pixelated;" />
        <div>
          <span style="font-weight: 400;">${author}</span>
          <span>posted</span>
          <span style="font-weight: 400;">${timeago.ago(created)}</span>
        </div>
      </div>
    </div>
  </div>
`;

return  {
  getAdventureSrc,
};

};

module.exports = {
  makeRenderer,
};