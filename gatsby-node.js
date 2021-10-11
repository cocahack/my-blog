/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */

'use strict';

exports.createPages = require('./gatsby/create-pages');
exports.onCreateNode = require('./gatsby/on-create-node');

const md5 = require('md5');
const util = require('util');
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const hash = md5(`${new Date().getTime()}`);

const addPageDataVersion = async (file) => {
  const stats = await util.promisify(fs.stat)(file);
  if (stats.isFile()) {
    console.log(`Adding version to page-data.json in ${file}..`);
    const content = await util.promisify(fs.readFile)(file, 'utf8');
    const result = content.replace(
      /page-data.json(\?v=[a-f0-9]{32})?/g,
      `page-data.json?v=${hash}`
    );
    await util.promisify(fs.writeFile)(file, result, 'utf8');
  }
};

exports.onPostBootstrap = async () => {
  const loader = path.join(__dirname, 'node_modules/gatsby/cache-dir/loader.js');
  await addPageDataVersion(loader);
};

exports.onPostBuild = async () => {
  const publicPath = path.join(__dirname, 'public');
  const htmlAndJSFiles = glob.sync(`${publicPath}/**/*.{html,js}`);
  for (const file of htmlAndJSFiles) {
    await addPageDataVersion(file);
  }
};
